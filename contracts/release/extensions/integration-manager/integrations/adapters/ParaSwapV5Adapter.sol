// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../utils/actions/ParaSwapV5ActionsMixin.sol";
import "../utils/AdapterBase.sol";

/// @title ParaSwapV5Adapter Contract
/// @author FNDZ Council <council@fndz.io>
/// @notice Adapter for interacting with ParaSwap (v5)
/// @dev Does not support any protocol that collects additional protocol fees as ETH/WETH, e.g., 0x v3
contract ParaSwapV5Adapter is AdapterBase, ParaSwapV5ActionsMixin {
    uint256 private constant FEE_FACTOR = 10000;

    constructor(
        address _integrationManager,
        address _augustusSwapper,
        address _tokenTransferProxy
    )
        public
        AdapterBase(_integrationManager)
        ParaSwapV5ActionsMixin(_augustusSwapper, _tokenTransferProxy)
    {}

    // EXTERNAL FUNCTIONS

    /// @notice Provides a constant string identifier for an adapter
    /// @return identifier_ An identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "PARA_SWAP_V5";
    }

    /// @notice Trades assets on ParaSwap
    /// @param _vaultProxy The VaultProxy of the calling fund
    /// @param _actionData Data specific to this action
    /// @dev ParaSwap v5 completely uses entire outgoing asset balance and incoming asset
    /// is sent directly to the beneficiary (the _vaultProxy)
    function takeOrder(
        address _vaultProxy,
        bytes calldata _actionData,
        bytes calldata
    ) external onlyIntegrationManager {
        (
            uint256 minIncomingAssetAmount,
            uint256 expectedIncomingAssetAmount,
            address outgoingAsset,
            uint256 outgoingAssetAmount,
            bytes16 uuid,
            address partnerAddress,
            uint256 partnerFee,
            IParaSwapV5AugustusSwapper.Path[] memory paths
        ) = __decodeCallArgs(_actionData);

        address payable vaultProxy = payable(_vaultProxy);
        __paraSwapV5ProtectedMultiSwap(
            outgoingAsset,
            outgoingAssetAmount,
            minIncomingAssetAmount,
            expectedIncomingAssetAmount,
            vaultProxy,
            uuid,
            partnerAddress,
            partnerFee,
            paths
        );
    }

    /// @notice Parses the expected assets in a particular action
    /// @param _selector The function selector for the callOnIntegration
    /// @param _actionData Data specific to this action
    /// @return spendAssetsHandleType_ A type that dictates how to handle granting
    /// the adapter access to spend assets (`None` by default)
    /// @return spendAssets_ The assets to spend in the call
    /// @return spendAssetAmounts_ The max asset amounts to spend in the call
    /// @return incomingAssets_ The assets to receive in the call
    /// @return minIncomingAssetAmounts_ The min asset amounts to receive in the call
    function parseAssetsForMethod(bytes4 _selector, bytes calldata _actionData)
        external
        view
        override
        returns (
            IIntegrationManager.SpendAssetsHandleType spendAssetsHandleType_,
            address[] memory spendAssets_,
            uint256[] memory spendAssetAmounts_,
            address[] memory incomingAssets_,
            uint256[] memory minIncomingAssetAmounts_
        )
    {
        require(_selector == TAKE_ORDER_SELECTOR, "parseAssetsForMethod: _selector invalid");

        (
            uint256 minIncomingAssetAmount,
            ,
            address outgoingAsset,
            uint256 outgoingAssetAmount,
            ,
            ,
            uint256 partnerFee,
            IParaSwapV5AugustusSwapper.Path[] memory paths
        ) = __decodeCallArgs(_actionData);

        spendAssets_ = new address[](1);
        spendAssets_[0] = outgoingAsset;

        spendAssetAmounts_ = new uint256[](1);
        spendAssetAmounts_[0] = outgoingAssetAmount;

        incomingAssets_ = new address[](1);
        incomingAssets_[0] = paths[paths.length - 1].to;

        // Update the incomingAssetAmount with ParaSwapFee Amount
        // To suppress the postCOI check on expectedIncomingAmount
        minIncomingAssetAmounts_ = new uint256[](1);
        minIncomingAssetAmounts_[0] = minIncomingAssetAmount.sub(
            minIncomingAssetAmount.mul(partnerFee).div(FEE_FACTOR)
        );

        return (
            IIntegrationManager.SpendAssetsHandleType.Transfer,
            spendAssets_,
            spendAssetAmounts_,
            incomingAssets_,
            minIncomingAssetAmounts_
        );
    }

    /// @dev Helper to decode the encoded callOnIntegration call arguments
    function __decodeCallArgs(bytes calldata _actionData)
        private
        pure
        returns (
            uint256 minIncomingAssetAmount_,
            uint256 expectedIncomingAssetAmount_, // Passed as a courtesy to ParaSwap for analytics
            address outgoingAsset_,
            uint256 outgoingAssetAmount_,
            bytes16 uuid_,
            address partnerAddress_,
            uint256 partnerFee_,
            IParaSwapV5AugustusSwapper.Path[] memory paths_
        )
    {
        return
            abi.decode(
                _actionData,
                (
                    uint256,
                    uint256,
                    address,
                    uint256,
                    bytes16,
                    address,
                    uint256,
                    IParaSwapV5AugustusSwapper.Path[]
                )
            );
    }
}
