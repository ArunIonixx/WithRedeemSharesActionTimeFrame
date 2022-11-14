// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";

/// @title AssetHelpers Contract
/// @author FNDZ Council <council@fndz.io>
/// @notice A util contract for common token actions
abstract contract AssetHelpers {
    using SafeERC20 for ERC20;
    using SafeMath for uint256;

    /// @dev Helper to approve a target account with the max amount of an asset.
    /// This is helpful for fully trusted contracts, such as adapters that
    /// interact with external protocol like Uniswap, Compound, etc.
    function __approveAssetMaxAsNeeded(
        address _asset,
        address _target,
        uint256 _neededAmount
    ) internal {
        if (ERC20(_asset).allowance(address(this), _target) < _neededAmount) {
            ERC20(_asset).safeApprove(_target, type(uint256).max);
        }
    }
}
