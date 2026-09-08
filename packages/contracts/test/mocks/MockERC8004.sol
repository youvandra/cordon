// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * ERC-8004 stand-ins, faithful in the two ways the record depends on.
 *
 * These are not deployed anywhere. The real registries are already live on Arc
 * at deterministic addresses and Cordon writes into those; these exist so the
 * gate can run without a fork, and so the properties being asserted are
 * asserted against the registry's actual shape.
 *
 * Two behaviours are modelled exactly, because G6 rests on them:
 *
 * - Feedback is filed **under the address that wrote it**. That is what makes
 *   a record from the seat unforgeable by anyone else: they may write whatever
 *   they like, but never under our address.
 * - Nothing is gated. Anyone may register, anyone may give feedback. The
 *   registry is permissionless, and a test that pretended otherwise would be
 *   proving a property the real one does not have.
 */
contract MockIdentityRegistry {
    uint256 private _next = 1;
    mapping(uint256 => address) private _owner;
    mapping(uint256 => string) public agentUri;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);

    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = _next++;
        _owner[agentId] = msg.sender;
        agentUri[agentId] = agentURI;
        emit Registered(agentId, agentURI, msg.sender);
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        address holder = _owner[agentId];
        require(holder != address(0), "no such agent");
        return holder;
    }
}

contract MockReputationRegistry {
    struct Feedback {
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        string endpoint;
        string feedbackURI;
        bytes32 feedbackHash;
        bool revoked;
    }

    struct Response {
        string responseURI;
        bytes32 responseHash;
        address responder;
    }

    /// @dev agentId => client => their own feedback, in the order they wrote it.
    mapping(uint256 => mapping(address => Feedback[])) private _feedback;
    mapping(uint256 => mapping(address => mapping(uint64 => Response[]))) private _responses;

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    event ResponseAppended(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        address indexed responder,
        string responseURI,
        bytes32 responseHash
    );

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        Feedback[] storage list = _feedback[agentId][msg.sender];
        list.push(
            Feedback({
                value: value,
                valueDecimals: valueDecimals,
                tag1: tag1,
                tag2: tag2,
                endpoint: endpoint,
                feedbackURI: feedbackURI,
                feedbackHash: feedbackHash,
                revoked: false
            })
        );
        /* Announced from storage in a second frame. Eleven event arguments and
           eight parameters do not fit on the stack together, and the shape of
           the event is the part worth keeping. */
        _announce(agentId, uint64(list.length - 1));
    }

    function _announce(uint256 agentId, uint64 index) private {
        Feedback storage f = _feedback[agentId][msg.sender][index];
        emit NewFeedback(
            agentId,
            msg.sender,
            index,
            f.value,
            f.valueDecimals,
            f.tag1,
            f.tag1,
            f.tag2,
            f.endpoint,
            f.feedbackURI,
            f.feedbackHash
        );
    }

    function appendResponse(
        uint256 agentId,
        address clientAddress,
        uint64 feedbackIndex,
        string calldata responseURI,
        bytes32 responseHash
    ) external {
        require(feedbackIndex < _feedback[agentId][clientAddress].length, "no such feedback");
        _responses[agentId][clientAddress][feedbackIndex].push(
            Response({responseURI: responseURI, responseHash: responseHash, responder: msg.sender})
        );
        emit ResponseAppended(agentId, clientAddress, feedbackIndex, msg.sender, responseURI, responseHash);
    }

    function getLastIndex(uint256 agentId, address clientAddress) external view returns (uint64) {
        uint256 length = _feedback[agentId][clientAddress].length;
        require(length != 0, "no feedback");
        return uint64(length - 1);
    }

    function readFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (int128 value, uint8 valueDecimals, string memory tag1, string memory tag2, bool isRevoked)
    {
        Feedback memory f = _feedback[agentId][clientAddress][feedbackIndex];
        return (f.value, f.valueDecimals, f.tag1, f.tag2, f.revoked);
    }

    /* Views the interface does not need but a test does. */

    function feedbackCount(uint256 agentId, address clientAddress) external view returns (uint256) {
        return _feedback[agentId][clientAddress].length;
    }

    function feedbackAt(uint256 agentId, address clientAddress, uint64 index)
        external
        view
        returns (Feedback memory)
    {
        return _feedback[agentId][clientAddress][index];
    }

    function responseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex)
        external
        view
        returns (uint256)
    {
        return _responses[agentId][clientAddress][feedbackIndex].length;
    }

    function responseAt(uint256 agentId, address clientAddress, uint64 feedbackIndex, uint256 index)
        external
        view
        returns (Response memory)
    {
        return _responses[agentId][clientAddress][feedbackIndex][index];
    }
}
