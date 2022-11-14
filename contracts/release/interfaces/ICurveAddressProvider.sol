// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title ICurveAddressProvider interface
/// @author FNDZ Council <council@fndz.io>
interface ICurveAddressProvider {
    function get_address(uint256) external view returns (address);

    function get_registry() external view returns (address);
}
