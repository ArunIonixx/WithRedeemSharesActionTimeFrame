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

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../release/core/fund/vault/VaultLib.sol";
import "../release/utils/MakerDaoMath.sol";
import "../release/extensions/fee-manager/fees/utils/FeeBase.sol";

/// @title MockManyParameterFee Contract
/// @notice Many Parameter Fee for Configuration
contract MockManyParameterFee is FeeBase, MakerDaoMath {
    using SafeMath for uint256;

    event FundSettingsAdded(
        address indexed comptrollerProxy,
        uint256 feeData1,
        uint256 feeData2,
        uint256 feeData3,
        uint256 feeData4,
        uint256 feeData5,
        uint256 feeData6,
        uint256 feeData7,
        uint256 feeData8,
        uint256 feeData9,
        uint256 feeData10
    );

    event Settled(
        address indexed comptrollerProxy,
        uint256 sharesQuantity,
        uint256 secondsSinceSettlement
    );
    struct FeeInfo {
        uint256 data1;
        uint256 data2;
        uint256 data3;
        uint256 data4;
        uint256 data5;
        uint256 data6;
        uint256 data7;
        uint256 data8;
        uint256 data9;
        uint256 data10;
    }

    event ActivatedForMigratedFund(address indexed comptrollerProxy);

    uint256 private constant RATE_SCALE_BASE = 10**27;

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(address _feeManager) public FeeBase(_feeManager) {}

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial fee parameter settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the fee parameter for a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager
    {
        (
            uint256 feeData1,
            uint256 feeData2,
            uint256 feeData3,
            uint256 feeData4,
            uint256 feeData5,
            uint256 feeData6,
            uint256 feeData7,
            uint256 feeData8,
            uint256 feeData9,
            uint256 feeData10
        ) = abi.decode(
            _settingsData,
            (
                uint256,
                uint256,
                uint256,
                uint256,
                uint256,
                uint256,
                uint256,
                uint256,
                uint256,
                uint256
            )
        );
        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo({
            data1: feeData1,
            data2: feeData2,
            data3: feeData3,
            data4: feeData4,
            data5: feeData5,
            data6: feeData6,
            data7: feeData7,
            data8: feeData8,
            data9: feeData9,
            data10: feeData10
        });

        emit FundSettingsAdded(
            _comptrollerProxy,
            feeData1,
            feeData2,
            feeData3,
            feeData4,
            feeData5,
            feeData6,
            feeData7,
            feeData8,
            feeData9,
            feeData10
        );
    }

    /// @notice Provides a constant string identifier for a fee
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "MOCK_MANY_PARAMETER";
    }

    /// @notice Gets the hooks that are implemented by the fee
    /// @return implementedHooksForSettle_ The hooks during which settle() is implemented
    /// @return implementedHooksForUpdate_ The hooks during which update() is implemented
    /// @return usesGavOnSettle_ True if GAV is used during the settle() implementation
    /// @return usesGavOnUpdate_ True if GAV is used during the update() implementation
    /// @dev Used only during fee registration
    function implementedHooks()
        external
        view
        override
        returns (
            IFeeManager.FeeHook[] memory implementedHooksForSettle_,
            IFeeManager.FeeHook[] memory implementedHooksForUpdate_,
            bool usesGavOnSettle_,
            bool usesGavOnUpdate_
        )
    {
        implementedHooksForSettle_ = new IFeeManager.FeeHook[](1);
        implementedHooksForSettle_[0] = IFeeManager.FeeHook.Continuous;
        return (implementedHooksForSettle_, new IFeeManager.FeeHook[](0), false, false);
    }

    /// @notice Settle the fee and calculate shares due
    /// @return settlementType_ The type of settlement
    /// @return (unused) The payer of shares due
    /// @return sharesDue_ The amount of shares due
    function settle(
        address,
        address,
        IFeeManager.FeeHook,
        bytes calldata,
        uint256
    )
        external
        override
        onlyFeeManager
        returns (
            IFeeManager.SettlementType settlementType_,
            address,
            uint256 sharesDue_
        )
    {
        return (IFeeManager.SettlementType.None, address(0), 0);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the feeInfo for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract of the fund
    /// @return parameter_ The feeparameter
    function getFeeInfoForFund(address _comptrollerProxy)
        external
        view
        returns (FeeInfo memory parameter_)
    {
        return comptrollerProxyToFeeInfo[_comptrollerProxy];
    }
}
