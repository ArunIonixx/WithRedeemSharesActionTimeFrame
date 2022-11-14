// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "../../../../persistent/dispatcher/IDispatcher.sol";
import "../../../../persistent/vault/VaultLibBase1.sol";
import "../../../../fndz/interfaces/IFNDZController.sol";
import "../../../interfaces/IUniswapV2Factory.sol";
import "../../../interfaces/IUniswapV2Pair.sol";
import "../../../interfaces/IUniswapV2Router2.sol";
import "./IVault.sol";

/// @title VaultLib Contract
/// @author FNDZ Council <council@fndz.io>
/// @notice The per-release proxiable library contract for VaultProxy
/// @dev The difference in terminology between "asset" and "trackedAsset" is intentional.
/// A fund might actually have asset balances of un-tracked assets,
/// but only tracked assets are used in gav calculations.
/// Note that this contract inherits VaultLibSafeMath (a verbatim Open Zeppelin SafeMath copy)
/// from SharesTokenBase via VaultLibBase1
contract VaultLib is VaultLibBase1, IVault {
    using SafeERC20 for ERC20;

    // Before updating TRACKED_ASSETS_LIMIT in the future, it is important to consider:
    // 1. The highest tracked assets limit ever allowed in the protocol
    // 2. That the next value will need to be respected by all future releases
    uint256 private constant TRACKED_ASSETS_LIMIT = 20;

    event AssetSwappedAndTransferred(
        address indexed sourceAsset,
        address indexed destinationAsset,
        address indexed target,
        uint256 sourceAmount,
        uint256 destinationAmount
    );

    modifier onlyAccessor() {
        require(msg.sender == accessor, "Only the designated accessor can make this call");
        _;
    }

    /////////////
    // GENERAL //
    /////////////

    /// @notice Sets the account that is allowed to migrate a fund to new releases
    /// @param _nextMigrator The account to set as the allowed migrator
    /// @dev Set to address(0) to remove the migrator.
    function setMigrator(address _nextMigrator) external {
        require(msg.sender == owner, "setMigrator: Only the owner can call this function");
        address prevMigrator = migrator;
        require(_nextMigrator != prevMigrator, "setMigrator: Value already set");

        migrator = _nextMigrator;

        emit MigratorSet(prevMigrator, _nextMigrator);
    }

    ///////////
    // VAULT //
    ///////////

    /// @notice Adds a tracked asset to the fund
    /// @param _asset The asset to add
    /// @dev Allows addition of already tracked assets to fail silently.
    function addTrackedAsset(address _asset) external override onlyAccessor {
        if (!isTrackedAsset(_asset)) {
            require(
                trackedAssets.length < TRACKED_ASSETS_LIMIT,
                "addTrackedAsset: Limit exceeded"
            );

            assetToIsTracked[_asset] = true;
            trackedAssets.push(_asset);

            emit TrackedAssetAdded(_asset);
        }
    }

    /// @notice Grants an allowance to a spender to use the fund's asset
    /// @param _asset The asset for which to grant an allowance
    /// @param _target The spender of the allowance
    /// @param _amount The amount of the allowance
    function approveAssetSpender(
        address _asset,
        address _target,
        uint256 _amount
    ) external override onlyAccessor {
        ERC20 assetContract = ERC20(_asset);
        if (assetContract.allowance(address(this), _target) > 0) {
            assetContract.safeApprove(_target, 0);
        }
        assetContract.safeApprove(_target, _amount);
    }

    /// @notice Makes an arbitrary call with this contract as the sender
    /// @param _contract The contract to call
    /// @param _callData The call data for the call
    function callOnContract(address _contract, bytes calldata _callData)
        external
        override
        onlyAccessor
    {
        (bool success, bytes memory returnData) = _contract.call(_callData);
        require(success, string(returnData));
    }

    /// @notice Removes a tracked asset from the fund
    /// @param _asset The asset to remove
    function removeTrackedAsset(address _asset) external override onlyAccessor {
        __removeTrackedAsset(_asset);
    }

    /// @notice Withdraws an asset from the VaultProxy to a given account
    /// @param _asset The asset to withdraw
    /// @param _target The account to which to withdraw the asset
    /// @param _amount The amount of asset to withdraw
    function withdrawAssetTo(
        address _asset,
        address _target,
        uint256 _amount
    ) external override onlyAccessor {
        ERC20(_asset).safeTransfer(_target, _amount);

        emit AssetWithdrawn(_asset, _target, _amount);
    }

    /// @notice Swaps a Vault asset via a Uniswap V2 router and sends the result to a given account
    /// @param _sourceAsset The vault-held asset that will be swapped
    /// @param _destinationAsset The final asset resulting from the swap which will be sent
    /// @param _target The account to which to withdraw the destination asset
    /// @param _sourceAmount The amount of the source asset to swap
    /// @param _minimumDestinationAmount The minimum amount of tokens you expect to receive after slippage
    /// @param _swapDeadline The timestamp by which the trade must execute before the transaction is reverted
    /// @param _swapPath The path for the swap, starting with the source asset and ending with the destination asset
    function swapAndWithdrawAssetTo(
        address _sourceAsset,
        address _destinationAsset,
        address _target,
        uint256 _sourceAmount,
        uint256 _minimumDestinationAmount,
        uint256 _swapDeadline,
        address[] memory _swapPath
    ) external override onlyAccessor returns (uint256 payoutAmount_) {
        return
            __swapAndTransferAssetTo(
                _sourceAsset,
                _destinationAsset,
                _target,
                _sourceAmount,
                _minimumDestinationAmount,
                _swapDeadline,
                _swapPath
            );
    }

    /// @notice Redeem virtual shares and transfer the underlying assets to the target address.
    /// The _virtualSharesQuantity should be checked at a higher level to be >0.
    /// @param _redemptionTarget The target address to receive the underlying assets
    /// @param _virtualSharesQuantity The quantity of virtual shares to redeem
    function redeemVirtualShares(address _redemptionTarget, uint256 _virtualSharesQuantity)
        external
        override
        onlyAccessor
        returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_)
    {
        payoutAssets_ = trackedAssets;
        payoutAmounts_ = new uint256[](payoutAssets_.length);

        // By FeeManager's __mintAndSplitHelper(), we are assured that _virtualSharesQuantity > 0
        // By ManagementFee's settle(), we are assured that sharesTotalSupply >> _virtualSharesQuantity
        // Similar assurances are made by the PerformanceFee's settlement logic

        // Since virtual shares are not minted and thus are not included in the vault's total shares supply,
        // to accurately calculate the amount of assets the target is entitled to, we need to
        // include the amount of virtual shares in the total shares supply
        uint256 sharesSupply = sharesTotalSupply + _virtualSharesQuantity;

        for (uint256 i; i < payoutAssets_.length; i++) {
            uint256 assetBalance = ERC20(payoutAssets_[i]).balanceOf(address(this));

            payoutAmounts_[i] = assetBalance.mul(_virtualSharesQuantity).div(sharesSupply);

            // Transfer payout asset to redeemer
            if (payoutAmounts_[i] > 0) {
                ERC20(payoutAssets_[i]).safeTransfer(_redemptionTarget, payoutAmounts_[i]);
                emit AssetWithdrawn(payoutAssets_[i], _redemptionTarget, payoutAmounts_[i]);
            }
        }

        return (payoutAssets_, payoutAmounts_);
    }

    /// @notice Redeem virtual shares, swap them to the global destination asset,
    // and transfer the underlying asset to the target address.
    /// The _virtualSharesQuantity should be checked at a higher level to be >0.
    /// @param _redemptionTarget The target address to receive the destination asset
    /// @param _virtualSharesQuantity The quantity of virtual shares to redeem
    function redeemAndSwapVirtualShares(address _redemptionTarget, uint256 _virtualSharesQuantity)
        external
        override
        onlyAccessor
        returns (address[] memory payoutAssets_, uint256[] memory payoutAmounts_)
    {
        payoutAssets_ = trackedAssets;
        payoutAmounts_ = new uint256[](payoutAssets_.length);

        // By FeeManager's __mintAndSplitHelper(), we are assured that _virtualSharesQuantity > 0
        // By ManagementFee's settle(), we are assured that sharesTotalSupply >> _virtualSharesQuantity
        // Similar assurances are made by the PerformanceFee's settlement logic

        (
            address uniswapV2FactoryAddress,
            address destinationAsset,
            uint256 swapDeadlineIncrement,
            uint256 slippageAllowance,
            uint256 slippageDivisor
        ) = IFNDZController(fndzController).getFeeInlineSwapData();

        for (uint256 i; i < payoutAssets_.length; i++) {
            uint256 assetBalance = ERC20(payoutAssets_[i]).balanceOf(address(this));

            // Since virtual shares are not minted and thus are not included in the vault's total shares supply,
            // to accurately calculate the amount of assets the target is entitled to, we need to
            // include the amount of virtual shares in the total shares supply
            payoutAmounts_[i] = assetBalance.mul(_virtualSharesQuantity).div(
                sharesTotalSupply.add(_virtualSharesQuantity)
            );

            // Transfer payout asset to redeemer
            if (payoutAmounts_[i] > 0) {
                address uniswapV2Pair = IUniswapV2Factory(uniswapV2FactoryAddress).getPair(
                    payoutAssets_[i],
                    destinationAsset
                );
                if (payoutAssets_[i] != destinationAsset && uniswapV2Pair != address(0)) {
                    // A uniswap pair exists, so we can perform a swap
                    payoutAmounts_[i] = __inlineSwapAsset(
                        payoutAssets_[i],
                        payoutAmounts_[i],
                        destinationAsset,
                        _redemptionTarget,
                        uniswapV2Pair,
                        swapDeadlineIncrement,
                        slippageAllowance,
                        slippageDivisor
                    );
                    payoutAssets_[i] = destinationAsset;
                } else {
                    // A uniswap pair does not exist, so we will just withdraw the underlying vault asset
                    ERC20(payoutAssets_[i]).safeTransfer(_redemptionTarget, payoutAmounts_[i]);
                    emit AssetWithdrawn(payoutAssets_[i], _redemptionTarget, payoutAmounts_[i]);
                }
            }
        }

        return (payoutAssets_, payoutAmounts_);
    }

    /// @dev method to swap tokens
    /// @param _sourceAsset source asset address of the swap
    /// @param _destinationAsset destination asset address of the swap
    /// @param _sourceAmount the amount of _sourceAsset to swap
    function swapAsset(
        address _sourceAsset,
        address _destinationAsset,
        uint256 _sourceAmount
    ) external override onlyAccessor returns (uint256 receivedAmount_) {
        (
            address uniswapV2FactoryAddress,
            ,
            uint256 swapDeadlineIncrement,
            uint256 slippageAllowance,
            uint256 slippageDivisor
        ) = IFNDZController(fndzController).getFeeInlineSwapData();

        uint256 assetBalance = ERC20(_sourceAsset).balanceOf(address(this));
        require(_sourceAmount <= assetBalance, "Insufficient asset balance");
        if (_sourceAsset == _destinationAsset) return 0;

        address uniswapV2Pair = IUniswapV2Factory(uniswapV2FactoryAddress).getPair(
            _sourceAsset,
            _destinationAsset
        );
        require(uniswapV2Pair != address(0), "swapAsset: uniswapV2Pair does not exist");

        receivedAmount_ = __inlineSwapAsset(
            _sourceAsset,
            _sourceAmount,
            _destinationAsset,
            address(this),
            uniswapV2Pair,
            swapDeadlineIncrement,
            slippageAllowance,
            slippageDivisor
        );
    }

    /// @dev Helper to remove an asset from a fund's tracked assets.
    /// Allows removal of non-tracked asset to fail silently.
    function __removeTrackedAsset(address _asset) private {
        if (isTrackedAsset(_asset)) {
            assetToIsTracked[_asset] = false;

            uint256 trackedAssetsCount = trackedAssets.length;
            for (uint256 i = 0; i < trackedAssetsCount; i++) {
                if (trackedAssets[i] == _asset) {
                    if (i < trackedAssetsCount - 1) {
                        trackedAssets[i] = trackedAssets[trackedAssetsCount - 1];
                    }
                    trackedAssets.pop();
                    break;
                }
            }

            emit TrackedAssetRemoved(_asset);
        }
    }

    ////////////
    // SHARES //
    ////////////

    /// @notice Burns fund shares from a particular account
    /// @param _target The account for which to burn shares
    /// @param _amount The amount of shares to burn
    function burnShares(address _target, uint256 _amount) external override onlyAccessor {
        __burn(_target, _amount);
    }

    /// @notice Mints fund shares to a particular account
    /// @param _target The account for which to burn shares
    /// @param _amount The amount of shares to mint
    function mintShares(address _target, uint256 _amount) external override onlyAccessor {
        __mint(_target, _amount);
    }

    /// @notice Transfers fund shares from one account to another
    /// @param _from The account from which to transfer shares
    /// @param _to The account to which to transfer shares
    /// @param _amount The amount of shares to transfer
    function transferShares(
        address _from,
        address _to,
        uint256 _amount
    ) external override onlyAccessor {
        __transfer(_from, _to, _amount);
    }

    // ERC20 overrides

    /// @dev Disallows the standard ERC20 approve() function
    function approve(address, uint256) public override returns (bool) {
        revert("Unimplemented");
    }

    /// @notice Gets the `symbol` value of the shares token
    /// @return symbol_ The `symbol` value
    /// @dev Defers the shares symbol value to the Dispatcher contract
    function symbol() public view override returns (string memory symbol_) {
        return IDispatcher(creator).getSharesTokenSymbol();
    }

    /// @dev Disallows the standard ERC20 transfer() function
    function transfer(address, uint256) public override returns (bool) {
        revert("Unimplemented");
    }

    /// @dev Disallows the standard ERC20 transferFrom() function
    function transferFrom(
        address,
        address,
        uint256
    ) public override returns (bool) {
        revert("Unimplemented");
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `accessor` variable
    /// @return accessor_ The `accessor` variable value
    function getAccessor() external view override returns (address accessor_) {
        return accessor;
    }

    /// @notice Gets the `creator` variable
    /// @return creator_ The `creator` variable value
    function getCreator() external view returns (address creator_) {
        return creator;
    }

    /// @notice Gets the `migrator` variable
    /// @return migrator_ The `migrator` variable value
    function getMigrator() external view returns (address migrator_) {
        return migrator;
    }

    /// @notice Gets the `owner` variable
    /// @return owner_ The `owner` variable value
    function getOwner() external view override returns (address owner_) {
        return owner;
    }

    /// @notice Gets the `trackedAssets` variable
    /// @return trackedAssets_ The `trackedAssets` variable value
    function getTrackedAssets() external view override returns (address[] memory trackedAssets_) {
        return trackedAssets;
    }

    /// @notice Check whether an address is a tracked asset of the fund
    /// @param _asset The address to check
    /// @return isTrackedAsset_ True if the address is a tracked asset of the fund
    function isTrackedAsset(address _asset) public view override returns (bool isTrackedAsset_) {
        return assetToIsTracked[_asset];
    }
}
