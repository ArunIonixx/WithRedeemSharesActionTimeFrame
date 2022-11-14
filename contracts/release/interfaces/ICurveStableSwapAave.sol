// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ICurveStableSwapAave interface
/// @author FNDZ Council <council@fndz.io>
interface ICurveStableSwapAave {
    function add_liquidity(
        uint256[3] calldata,
        uint256,
        bool
    ) external returns (uint256);

    function remove_liquidity(
        uint256,
        uint256[3] calldata,
        bool
    ) external returns (uint256[3] memory);

    function remove_liquidity_one_coin(
        uint256,
        int128,
        uint256,
        bool
    ) external returns (uint256);
}
