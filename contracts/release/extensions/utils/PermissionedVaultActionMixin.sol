// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../../core/fund/comptroller/IComptroller.sol";

/// @title PermissionedVaultActionMixin Contract
/// @author FNDZ Council <council@fndz.io>
/// @notice A mixin contract for extensions that can make permissioned vault calls
abstract contract PermissionedVaultActionMixin {
    event InlineShareRedemptionFailed(
        bytes failureReturnData,
        address comptrollerProxy,
        address redemptionTarget,
        uint256 sharesAmount,
        bool inlineSwap
    );

    event InlineSwapFailed(
        bytes failureReturnData,
        address comptrollerProxy,
        address sourceAsset,
        address destinationAsset,
        uint256 amount
    );

    /// @notice Adds a tracked asset to the fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset to add
    function __addTrackedAsset(address _comptrollerProxy, address _asset) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.AddTrackedAsset,
            abi.encode(_asset)
        );
    }

    /// @notice Grants an allowance to a spender to use a fund's asset
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset for which to grant an allowance
    /// @param _target The spender of the allowance
    /// @param _amount The amount of the allowance
    function __approveAssetSpender(
        address _comptrollerProxy,
        address _asset,
        address _target,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.ApproveAssetSpender,
            abi.encode(_asset, _target, _amount)
        );
    }

    /// @notice Burns fund shares for a particular account
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _target The account for which to burn shares
    /// @param _amount The amount of shares to burn
    function __burnShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.BurnShares,
            abi.encode(_target, _amount)
        );
    }

    /// @notice Mints fund shares to a particular account
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _target The account to which to mint shares
    /// @param _amount The amount of shares to mint
    function __mintShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.MintShares,
            abi.encode(_target, _amount)
        );
    }

    /// @notice Removes a tracked asset from the fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset to remove
    function __removeTrackedAsset(address _comptrollerProxy, address _asset) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.RemoveTrackedAsset,
            abi.encode(_asset)
        );
    }

    /// @notice Transfers fund shares from one account to another
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _from The account from which to transfer shares
    /// @param _to The account to which to transfer shares
    /// @param _amount The amount of shares to transfer
    function __transferShares(
        address _comptrollerProxy,
        address _from,
        address _to,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.TransferShares,
            abi.encode(_from, _to, _amount)
        );
    }

    /// @notice Withdraws an asset from the VaultProxy to a given account
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _asset The asset to withdraw
    /// @param _target The account to which to withdraw the asset
    /// @param _amount The amount of asset to withdraw
    function __withdrawAssetTo(
        address _comptrollerProxy,
        address _asset,
        address _target,
        uint256 _amount
    ) internal {
        IComptroller(_comptrollerProxy).permissionedVaultAction(
            IComptroller.VaultAction.WithdrawAssetTo,
            abi.encode(_asset, _target, _amount)
        );
    }

    /// @notice Redeem shares that have not yet been minted
    /// If share redemption fails for some reason, just mint the shares
    /// as a fallback.
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _target The account to which to send the assets
    /// @param _amount The amount of virtual shares to redeem
    function __redeemVirtualShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) internal {
        try
            IComptroller(_comptrollerProxy).permissionedVaultAction(
                IComptroller.VaultAction.RedeemVirtualShares,
                abi.encode(_target, _amount)
            )
         {} catch (bytes memory reason) {
            emit InlineShareRedemptionFailed(reason, _comptrollerProxy, _target, _amount, false);
            IComptroller(_comptrollerProxy).permissionedVaultAction(
                IComptroller.VaultAction.MintShares,
                abi.encode(_target, _amount)
            );
        }
    }

    /// @notice Redeem and swap shares that have not yet been minted
    /// If share redemption fails for some reason, just mint the shares
    /// as a fallback.
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _target The account to which to send the assets
    /// @param _amount The amount of virtual shares to redeem
    function __redeemAndSwapVirtualShares(
        address _comptrollerProxy,
        address _target,
        uint256 _amount
    ) internal {
        try
            IComptroller(_comptrollerProxy).permissionedVaultAction(
                IComptroller.VaultAction.RedeemAndSwapVirtualShares,
                abi.encode(_target, _amount)
            )
         {} catch (bytes memory reason) {
            emit InlineShareRedemptionFailed(reason, _comptrollerProxy, _target, _amount, true);
            IComptroller(_comptrollerProxy).permissionedVaultAction(
                IComptroller.VaultAction.MintShares,
                abi.encode(_target, _amount)
            );
        }
    }

    /// @dev Swap the assets through permissioned vault action
    /// @param _comptrollerProxy comptroller proxy contract address of the fund
    /// @param _fromAsset source address of the swap
    /// @param _toAsset destination address of the swap
    /// @param _amount amount of source tokens to be swapped
    function __swapAsset(
        address _comptrollerProxy,
        address _fromAsset,
        address _toAsset,
        uint256 _amount
    ) internal {
        try
            IComptroller(_comptrollerProxy).permissionedVaultAction(
                IComptroller.VaultAction.SwapAsset,
                abi.encode(_fromAsset, _toAsset, _amount)
            )
         {} catch (bytes memory reason) {
            emit InlineSwapFailed(reason, _comptrollerProxy, _fromAsset, _toAsset, _amount);
        }
    }
}
