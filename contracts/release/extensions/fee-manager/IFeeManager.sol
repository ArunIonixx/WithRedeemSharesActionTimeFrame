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

/// @title FeeManager Interface
/// @author FNDZ Council <council@fndz.io>
/// @notice Interface for the FeeManager
interface IFeeManager {
    enum FeeHook {
        Continuous,
        PostContinuous,
        BuySharesSetup,
        PreBuyShares,
        PostBuyShares,
        BuySharesCompleted,
        PreRedeemShares,
        PostRedeemShares,
        PreRedeemShortValidation
    }
    enum SettlementType {
        None,
        Direct,
        Mint,
        Burn,
        MintSharesOutstanding,
        BurnSharesOutstanding,
        MintAndSplit,
        DirectToReferrer,
        BuyToLockFNDZ
    }

    function invokeHook(
        FeeHook,
        bytes calldata,
        uint256
    ) external;
}
