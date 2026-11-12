/**
 * Attack / abuse scenarios for academic security criterion.
 * These are Hardhat unit tests (no live exploit tooling).
 */
import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { declarationKey } from "../helpers/declarationKey";

const MAX_REWARD_WEI = ethers.parseEther("1000");

describe("Attack scenarios — RecyclingRegistry", function () {
  async function deployFixture() {
    const [admin, attacker, victim] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("EcoToken");
    const token = await Token.deploy(admin.address);
    await token.waitForDeployment();
    const Registry = await ethers.getContractFactory("RecyclingRegistry");
    const registry = await Registry.deploy(await token.getAddress(), admin.address, MAX_REWARD_WEI);
    await registry.waitForDeployment();
    await (await token.setMinter(await registry.getAddress())).wait();
    return { admin, attacker, victim, token, registry };
  }

  it("attacker cannot mint ECO directly via EcoToken.mint", async function () {
    const { attacker, token } = await loadFixture(deployFixture);
    await expect(token.connect(attacker).mint(attacker.address, ethers.parseEther("999999"))).to.be.revertedWith(
      "Only registry can mint"
    );
  });

  it("attacker cannot call registry.reward (onlyOwner)", async function () {
    const { attacker, victim, registry } = await loadFixture(deployFixture);
    const id = declarationKey("attacker-reward");
    await expect(
      registry.connect(attacker).reward(id, attacker.address, ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
    await expect(
      registry.connect(attacker).reward(id, victim.address, ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(registry, "OwnableUnauthorizedAccount");
  });

  it("replay attack: same declarationId cannot be rewarded twice", async function () {
    const { admin, victim, attacker, registry, token } = await loadFixture(deployFixture);
    const id = declarationKey("replay-attack");
    await registry.connect(admin).reward(id, victim.address, ethers.parseEther("12"));
    await expect(
      registry.connect(admin).reward(id, attacker.address, ethers.parseEther("12"))
    ).to.be.revertedWith("Already processed");
    expect(await token.balanceOf(victim.address)).to.equal(ethers.parseEther("12"));
    expect(await token.balanceOf(attacker.address)).to.equal(0);
  });

  it("griefing: amount above on-chain cap is rejected without marking processed", async function () {
    const { admin, attacker, registry } = await loadFixture(deployFixture);
    const id = declarationKey("cap-grief");
    await expect(
      registry.connect(admin).reward(id, attacker.address, MAX_REWARD_WEI + 1n)
    ).to.be.revertedWith("Above max reward");
    expect(await registry.isProcessed(id)).to.equal(false);
  });

  it("compromised-key blast radius: pause freezes further mints", async function () {
    const { admin, victim, registry, token } = await loadFixture(deployFixture);
    await registry.connect(admin).pause();
    const id = declarationKey("post-pause");
    await expect(
      registry.connect(admin).reward(id, victim.address, ethers.parseEther("1"))
    ).to.be.revertedWithCustomError(registry, "EnforcedPause");
    expect(await token.balanceOf(victim.address)).to.equal(0);
  });

  it("setMinter cannot be redirected after first configuration", async function () {
    const { admin, attacker, token } = await loadFixture(deployFixture);
    await expect(token.connect(admin).setMinter(attacker.address)).to.be.revertedWith(
      "Minter already configured"
    );
  });
});
