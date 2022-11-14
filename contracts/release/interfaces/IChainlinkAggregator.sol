// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IChainlinkAggregator Interface
/// @author FNDZ Council <council@fndz.io>
interface IChainlinkAggregator {
    function latestAnswer() external view returns (int256);

    function latestTimestamp() external view returns (uint256);
}
