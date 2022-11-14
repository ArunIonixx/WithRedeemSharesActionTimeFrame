// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity ^0.6.12;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title ICERC20 Interface
/// @author FNDZ Council <council@fndz.io>
/// @notice Minimal interface for interactions with Compound tokens (cTokens)
interface ICERC20 is IERC20 {
    function decimals() external view returns (uint8);

    function mint(uint256) external returns (uint256);

    function redeem(uint256) external returns (uint256);

    function exchangeRateStored() external view returns (uint256);

    function underlying() external returns (address);
}
