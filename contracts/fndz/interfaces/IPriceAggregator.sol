// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

/// @title IPriceAggregator Interface
interface IPriceAggregator {
    function getPrice(address) external view returns (int256);

    function latestTimestamp() external view returns (uint256);
}
