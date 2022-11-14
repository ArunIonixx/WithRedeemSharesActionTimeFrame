// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

/// @title IYearnVaultV2 Interface
/// @author FNDZ Council <council@fndz.io>
/// @notice Minimal interface for our interactions with Yearn Vault V2 contracts
interface IYearnVaultV2 {
    function deposit(uint256, address) external returns (uint256);

    function pricePerShare() external view returns (uint256);

    function token() external view returns (address);

    function withdraw(
        uint256,
        address,
        uint256
    ) external returns (uint256);
}
