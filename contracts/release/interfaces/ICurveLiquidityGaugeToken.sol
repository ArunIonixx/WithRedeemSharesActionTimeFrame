// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ICurveLiquidityGaugeToken interface
/// @author FNDZ Council <council@fndz.io>
/// @notice Common interface functions for all Curve liquidity gauge token contracts
interface ICurveLiquidityGaugeToken {
    function lp_token() external view returns (address);
}