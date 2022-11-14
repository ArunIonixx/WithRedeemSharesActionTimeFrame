// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../../../persistent/utils/IMigratableVault.sol";

/// @title IVault Interface
/// @author FNDZ Council <council@fndz.io>
interface IVault is IMigratableVault {
    function addTrackedAsset(address) external;

    function approveAssetSpender(
        address,
        address,
        uint256
    ) external;

    function burnShares(address, uint256) external;

    function callOnContract(address, bytes calldata) external;

    function getAccessor() external view returns (address);

    function getOwner() external view returns (address);

    function getTrackedAssets() external view returns (address[] memory);

    function isTrackedAsset(address) external view returns (bool);

    function mintShares(address, uint256) external;

    function removeTrackedAsset(address) external;

    function transferShares(
        address,
        address,
        uint256
    ) external;

    function withdrawAssetTo(
        address,
        address,
        uint256
    ) external;

    function swapAndWithdrawAssetTo(
        address _sourceAsset,
        address _destinationAsset,
        address _target,
        uint256 _sourceAmount,
        uint256 _minimumDestinationAmount,
        uint256 _swapDeadline,
        address[] calldata _swapPath
    ) external returns (uint256);

    function swapAsset(
        address _sourceAsset,
        address _destinationAsset,
        uint256 _sourceAmount
    ) external returns (uint256);

    function redeemVirtualShares(address _redemptionTarget, uint256 _virtualSharesQuantity)
        external
        returns (address[] memory, uint256[] memory);

    function redeemAndSwapVirtualShares(address _redemptionTarget, uint256 _virtualSharesQuantity)
        external
        returns (address[] memory, uint256[] memory);
}
