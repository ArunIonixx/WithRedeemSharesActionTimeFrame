// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ICurveLiquidityPool interface
/// @author FNDZ Council <council@fndz.io>
interface ICurveLiquidityPool {
    function coins(uint256) external view returns (address);

    function get_virtual_price() external view returns (uint256);
}
