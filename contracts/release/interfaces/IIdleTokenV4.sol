// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title IIdleTokenV4 Interface
/// @author FNDZ Council <council@fndz.io>
/// @notice Minimal interface for our interactions with IdleToken (V4) contracts
interface IIdleTokenV4 {
    function getGovTokensAmounts(address) external view returns (uint256[] calldata);

    function govTokens(uint256) external view returns (address);

    function mintIdleToken(
        uint256,
        bool,
        address
    ) external returns (uint256);

    function redeemIdleToken(uint256) external returns (uint256);

    function token() external view returns (address);

    function tokenPrice() external view returns (uint256);
}
