// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * ERC-8004 — the registries Cordon writes into, and does not deploy.
 *
 * Identity `0x8004A818BFB912233c491871b3d84c89A494BD9e` and Reputation
 * `0x8004B663056A597Dffe9eCcC1965A193B7388713` are already live on Arc, at
 * deterministic addresses across 40+ chains. Building our own registry would
 * produce a silo nobody reads; the read side of this one is a public good and
 * the whole point is that anybody can read it without our permission.
 *
 * Only the functions Cordon actually calls are declared here. An interface is
 * a claim about another contract's shape, and a claim we never exercise is one
 * nothing would catch if it were wrong.
 */

/// @dev Identity is an ERC-721, so `ownerOf` is the canonical link between an
///      agent id and the key that holds it.
interface IIdentityRegistry {
    function register(string calldata agentURI) external returns (uint256 agentId);
    function ownerOf(uint256 agentId) external view returns (address);
}

interface IReputationRegistry {
    /**
     * @param value the measurement itself. Cordon writes the amount a bound
     *        refused, in USDC base units, with `valueDecimals` of 6 — never a
     *        rating, never a score somebody chose.
     * @param feedbackURI where the record resolves.
     * @param feedbackHash commits to the vault tuple the record was made from,
     *        so a reader can recompute it and find any disagreement.
     */
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external;

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64);

    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked);
}
