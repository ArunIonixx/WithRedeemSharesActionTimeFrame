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
import "./utils/FeeBase.sol";
import "./utils/IRedeemSharesActionTimeFrame.sol";

/// @title RedeemSharesActionTimeFrame Contract
/// @author FNDZ Council <council@fndz.io>
/// @notice A Time frame configuration for withdrawn period and short Trade period.
/// No Fee setup involved.

contract RedeemSharesActionTimeFrame is FeeBase,IRedeemSharesActionTimeFrame {
    using SafeMath for uint256;
    event FundSettingsAdded(
        address indexed comptrollerProxy,
        uint256 sharesActionPeriod,
        uint256 shortingPeriod,
        uint256 firstSharesActionTimestamp
    );

    struct FeeInfo {
        uint256 sharesActionPeriod;
        uint256 shortingPeriod;
        uint256 firstSharesActionTimestamp;
    }

    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(address _feeManager) public FeeBase(_feeManager) {}

    // EXTERNAL FUNCTIONS

    /// @notice Add the initial policy settings for a Short Trade
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the policy for the RedeemShares
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager
    {
        (uint256 _sharesActionPeriod, uint256 _shortingPeriod) = abi.decode(
            _settingsData,
            (uint256, uint256)
        );

        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo({
            sharesActionPeriod: _sharesActionPeriod,
            shortingPeriod: _shortingPeriod,
            firstSharesActionTimestamp: block.timestamp
        });
        emit FundSettingsAdded(
            _comptrollerProxy,
            _sharesActionPeriod,
            _shortingPeriod,
            comptrollerProxyToFeeInfo[_comptrollerProxy].firstSharesActionTimestamp
        );
    }

    /// @notice Provides a constant string identifier for a fee
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "REDEEMSHARES_ACTION_TIMEFRAME";
    }

    /// @notice Gets the hooks that are implemented by the fee
    /// @return implementedHooksForSettle_ The hooks during which settle() is implemented
    /// @return implementedHooksForUpdate_ No Hooks
    /// @return usesGavOnSettle_ Flase if GAV is used during the settle() implementation
    /// @return usesGavOnUpdate_ Flase if GAV is used during the update() implementation
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
        implementedHooksForSettle_ = new IFeeManager.FeeHook[](2);
        implementedHooksForSettle_[0] = IFeeManager.FeeHook.PreRedeemShortValidation;
        return (implementedHooksForSettle_, implementedHooksForUpdate_, false, false);
    }

    /// @notice Settle is called to check wheater current timestamp match with
    /// widthdrawn cycle time frame or not, else it reverts
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// TODO: if Current timeframe is in ReedeemActionTimeframe, it returns control called function,else Revert the control
    function settle(
        address _comptrollerProxy,
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
            uint256
        )
    {      
        TimeFrame _Timeframe = _getCurrentTimeframe(_comptrollerProxy);
        require(_Timeframe==TimeFrame.SHARES_ACTION_TIMEFRAME,      
                "RedeemSharesActionTimeFrame : Shorting Period - User operations are not allowed "
            );              
        return (IFeeManager.SettlementType.None, address(0), 0);
    }
    
    /// @notice Gets the current time frame for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract of the fund
    /// @return timeFrame calculated current time frame
    function getCurrentTimeframe(address _comptrollerProxy)external view override
        returns (TimeFrame timeFrame)
        {  
            return _getCurrentTimeframe(_comptrollerProxy);
        }

    /// @dev Helper to calculate current time frame for a given fund
    function _getCurrentTimeframe(address _comptrollerProxy) internal view
        returns (TimeFrame timeFrame)
        {       
            uint256 timeStampDiff = (block.timestamp.sub(comptrollerProxyToFeeInfo[_comptrollerProxy].firstSharesActionTimestamp))
            .mod(comptrollerProxyToFeeInfo[_comptrollerProxy].sharesActionPeriod
            .add(comptrollerProxyToFeeInfo[_comptrollerProxy].shortingPeriod));

            if (timeStampDiff <= comptrollerProxyToFeeInfo[_comptrollerProxy].sharesActionPeriod)
            {
                return TimeFrame.SHARES_ACTION_TIMEFRAME;
            }
            else
            {
                return TimeFrame.SHORTING_TIMEFRAME;
            }
        }                      
           
    /// @notice Gets the timeframeInfo for a given fund
    /// @param _comptrollerProxy The ComptrollerProxy contract of the fund
    /// @return feeInfo_ The feeInfo
    function getFeeInfoForFund(address _comptrollerProxy)
        external
        view
        returns (FeeInfo memory feeInfo_)
    {
        return comptrollerProxyToFeeInfo[_comptrollerProxy];
    }
}
