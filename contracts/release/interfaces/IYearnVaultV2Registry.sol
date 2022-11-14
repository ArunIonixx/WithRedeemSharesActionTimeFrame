// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IYearnVaultV2Registry Interface
/// @author FNDZ Council <council@fndz.io>
/// @notice Minimal interface for our interactions with the Yearn Vault V2 registry
interface IYearnVaultV2Registry {
    function numVaults(address) external view returns (uint256);

    function vaults(address, uint256) external view returns (address);
}
