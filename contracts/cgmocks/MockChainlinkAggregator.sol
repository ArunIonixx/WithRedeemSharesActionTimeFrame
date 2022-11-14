// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

/// @title MockChainlinkAggregator
/// @author Curvegrid <contact@curvegrid.com>
contract MockChainlinkAggregator {
    int256 private answer;
    address public owner;

    event LatestAnswerSet(address indexed who, int256 indexed latestAnswer);

    constructor(int256 _latestAnswer) public {
        if (_latestAnswer != 0) {
            answer = _latestAnswer;
        } else {
            answer = 100;
        }
        emit LatestAnswerSet(msg.sender, answer);

        owner = msg.sender;
    }

    function setLatestAnswer(int256 _latestAnswer) external {
        require(msg.sender == owner, "sender now owner");
        answer = _latestAnswer;
        emit LatestAnswerSet(msg.sender, answer);
    }

    function latestAnswer() external view returns (int256) {
        return answer;
    }

    function latestTimestamp() external view returns (uint256) {
        return block.timestamp;
    }
}
