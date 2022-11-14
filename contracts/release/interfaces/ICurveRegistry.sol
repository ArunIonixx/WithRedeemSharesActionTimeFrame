// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ICurveRegistry interface
/// @author FNDZ Council <council@fndz.io>
interface ICurveRegistry {
    function get_gauges(address) external view returns (address[10] memory, int128[10] memory);

    function get_lp_token(address) external view returns (address);

    function get_pool_from_lp_token(address) external view returns (address);
}
