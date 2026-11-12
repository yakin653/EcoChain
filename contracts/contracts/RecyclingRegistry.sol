// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./EcoToken.sol";

/// @notice One reward per declaration key. The owner is the backend operator account.
/// @dev Hardening académique : Pausable + plafond par mint + ReentrancyGuard (défense en profondeur).
contract RecyclingRegistry is Ownable, Pausable, ReentrancyGuard {
    EcoToken public immutable ecoToken;
    /// @notice Cap per reward call (wei, 18 decimals). Aligned with backend REWARD_MAX_ECO_PER_DECLARATION.
    uint256 public maxRewardWei;
    mapping(bytes32 => bool) public processedDeclarations;

    event Rewarded(bytes32 indexed declarationId, address indexed beneficiary, uint256 amount);
    event MaxRewardUpdated(uint256 previousMax, uint256 newMax);

    constructor(address tokenAddress, address admin, uint256 initialMaxRewardWei) Ownable(admin) {
        require(tokenAddress != address(0), "Invalid token");
        require(initialMaxRewardWei > 0, "Invalid max reward");
        ecoToken = EcoToken(tokenAddress);
        maxRewardWei = initialMaxRewardWei;
    }

    function reward(bytes32 declarationId, address beneficiary, uint256 amount)
        external
        onlyOwner
        whenNotPaused
        nonReentrant
    {
        require(declarationId != bytes32(0), "Invalid declaration id");
        require(!processedDeclarations[declarationId], "Already processed");
        require(beneficiary != address(0), "Invalid beneficiary");
        require(amount > 0, "Amount must be positive");
        require(amount <= maxRewardWei, "Above max reward");

        // Mark before external call; transaction rollback restores state if mint reverts.
        processedDeclarations[declarationId] = true;
        ecoToken.mint(beneficiary, amount);
        emit Rewarded(declarationId, beneficiary, amount);
    }

    function isProcessed(bytes32 declarationId) external view returns (bool) {
        return processedDeclarations[declarationId];
    }

    /// @notice Emergency stop for rewards (does not unlock already processed declarations).
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Owner may only lower the cap (never raise) to reduce blast radius if key is compromised.
    function lowerMaxRewardWei(uint256 newMax) external onlyOwner {
        require(newMax > 0, "Invalid max reward");
        require(newMax < maxRewardWei, "Can only lower max");
        uint256 previous = maxRewardWei;
        maxRewardWei = newMax;
        emit MaxRewardUpdated(previous, newMax);
    }
}
