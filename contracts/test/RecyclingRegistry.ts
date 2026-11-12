import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { declarationKey } from "../helpers/declarationKey";

/** 1000 ECO — aligned with backend REWARD_MAX_ECO_PER_DECLARATION */
const MAX_REWARD_WEI = ethers.parseEther("1000");

describe("RecyclingRegistry + EcoToken", function () {
  async function deployFixture() {
    const [admin, user, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("EcoToken");
    const token = await Token.deploy(admin.address);
    await token.waitForDeployment();
    const Registry = await ethers.getContractFactory("RecyclingRegistry");
    const registry = await Registry.deploy(await token.getAddress(), admin.address, MAX_REWARD_WEI);
    await registry.waitForDeployment();
    await (await token.setMinter(await registry.getAddress())).wait();
    return { admin, user, other, token, registry };
  }

  it("uses the canonical UUID→bytes32 declarationKey (backend-compatible)", async function () {
    const uuid = "11111111-1111-1111-1111-111111111111";
    const key = declarationKey(uuid);
    expect(key).to.equal(ethers.id(uuid.toLowerCase()));
    expect(key).to.equal(ethers.keccak256(ethers.toUtf8Bytes(uuid.toLowerCase())));
    expect(declarationKey(uuid.toUpperCase())).to.equal(key);
  });

  it("mints a valid reward once and emits Rewarded", async function () {
    const { user, registry, token } = await loadFixture(deployFixture);
    const id = declarationKey("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    const amount = ethers.parseUnits("25", 18);

    await expect(registry.reward(id, user.address, amount))
      .to.emit(registry, "Rewarded")
      .withArgs(id, user.address, amount);

    expect(await token.balanceOf(user.address)).to.equal(amount);
    expect(await registry.isProcessed(id)).to.equal(true);
    expect(await registry.processedDeclarations(id)).to.equal(true);
  });

  it("rejects an already processed declaration (double mint guard)", async function () {
    const { user, registry, token } = await loadFixture(deployFixture);
    const id = declarationKey("declaration-already-processed");
    const amount = ethers.parseUnits("10", 18);

    await registry.reward(id, user.address, amount);
    await expect(registry.reward(id, user.address, amount)).to.be.revertedWith("Already processed");
    expect(await token.balanceOf(user.address)).to.equal(amount);
  });

  it("rejects double mint with a different beneficiary for the same declarationId", async function () {
    const { user, other, registry, token } = await loadFixture(deployFixture);
    const id = declarationKey("same-id-other-wallet");
    const amount = ethers.parseUnits("7", 18);

    await registry.reward(id, user.address, amount);
    await expect(registry.reward(id, other.address, amount)).to.be.revertedWith("Already processed");
    expect(await token.balanceOf(user.address)).to.equal(amount);
    expect(await token.balanceOf(other.address)).to.equal(0);
  });

  it("rejects invalid beneficiary wallet (zero address)", async function () {
    const { registry } = await loadFixture(deployFixture);
    const id = declarationKey("invalid-wallet");
    await expect(registry.reward(id, ethers.ZeroAddress, 1n)).to.be.revertedWith("Invalid beneficiary");
  });

  it("rejects invalid amount (zero)", async function () {
    const { user, registry } = await loadFixture(deployFixture);
    const id = declarationKey("invalid-amount");
    await expect(registry.reward(id, user.address, 0n)).to.be.revertedWith("Amount must be positive");
  });

  it("rejects invalid declaration id (bytes32 zero)", async function () {
    const { user, registry } = await loadFixture(deployFixture);
    await expect(registry.reward(ethers.ZeroHash, user.address, 1n)).to.be.revertedWith(
      "Invalid declaration id"
    );
  });

  it("rejects unauthorized (non-owner) reward calls", async function () {
    const { other, user, registry } = await loadFixture(deployFixture);
    const id = declarationKey("unauthorized");
    await expect(registry.connect(other).reward(id, user.address, 1n)).to.be.revertedWithCustomError(
      registry,
      "OwnableUnauthorizedAccount"
    );
  });

  it("verifies minter role: only registry can mint; setMinter is one-shot", async function () {
    const { admin, user, other, token, registry } = await loadFixture(deployFixture);
    const registryAddress = await registry.getAddress();

    expect(await token.minter()).to.equal(registryAddress);

    await expect(token.connect(user).mint(user.address, 1n)).to.be.revertedWith("Only registry can mint");
    await expect(token.connect(admin).mint(user.address, 1n)).to.be.revertedWith("Only registry can mint");
    await expect(token.connect(other).setMinter(other.address)).to.be.revertedWithCustomError(
      token,
      "OwnableUnauthorizedAccount"
    );
    await expect(token.connect(admin).setMinter(other.address)).to.be.revertedWith("Minter already configured");
  });

  it("rejects setMinter(zero) before configuration on a fresh token", async function () {
    const [admin, stranger] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("EcoToken");
    const token = await Token.deploy(admin.address);
    await token.waitForDeployment();

    await expect(token.setMinter(ethers.ZeroAddress)).to.be.revertedWith("Invalid minter");
    await expect(token.connect(stranger).setMinter(stranger.address)).to.be.revertedWithCustomError(
      token,
      "OwnableUnauthorizedAccount"
    );
    expect(await token.minter()).to.equal(ethers.ZeroAddress);
  });

  it("enforces maxRewardWei cap (attack: oversized mint)", async function () {
    const { user, registry } = await loadFixture(deployFixture);
    const id = declarationKey("above-cap");
    const tooMuch = MAX_REWARD_WEI + 1n;
    await expect(registry.reward(id, user.address, tooMuch)).to.be.revertedWith("Above max reward");
    expect(await registry.isProcessed(id)).to.equal(false);
  });

  it("pause blocks rewards; unpause restores (emergency stop)", async function () {
    const { admin, user, other, registry } = await loadFixture(deployFixture);
    const id = declarationKey("while-paused");
    await expect(registry.connect(other).pause()).to.be.revertedWithCustomError(
      registry,
      "OwnableUnauthorizedAccount"
    );
    await (await registry.connect(admin).pause()).wait();
    await expect(registry.reward(id, user.address, ethers.parseEther("1"))).to.be.revertedWithCustomError(
      registry,
      "EnforcedPause"
    );
    await (await registry.connect(admin).unpause()).wait();
    await expect(registry.reward(id, user.address, ethers.parseEther("1")))
      .to.emit(registry, "Rewarded");
  });

  it("lowerMaxRewardWei can only decrease the cap", async function () {
    const { admin, other, registry } = await loadFixture(deployFixture);
    const lower = ethers.parseEther("100");
    await expect(registry.connect(other).lowerMaxRewardWei(lower)).to.be.revertedWithCustomError(
      registry,
      "OwnableUnauthorizedAccount"
    );
    await expect(registry.connect(admin).lowerMaxRewardWei(MAX_REWARD_WEI)).to.be.revertedWith(
      "Can only lower max"
    );
    await expect(registry.connect(admin).lowerMaxRewardWei(lower))
      .to.emit(registry, "MaxRewardUpdated")
      .withArgs(MAX_REWARD_WEI, lower);
    expect(await registry.maxRewardWei()).to.equal(lower);
  });

  it("checks-effects-interactions: failed second call leaves first reward intact", async function () {
    const { user, other, registry, token } = await loadFixture(deployFixture);
    const id = declarationKey("cei-double");
    const amount = ethers.parseEther("5");
    await registry.reward(id, user.address, amount);
    await expect(registry.reward(id, other.address, amount)).to.be.revertedWith("Already processed");
    expect(await token.balanceOf(user.address)).to.equal(amount);
    expect(await token.balanceOf(other.address)).to.equal(0);
  });
});
