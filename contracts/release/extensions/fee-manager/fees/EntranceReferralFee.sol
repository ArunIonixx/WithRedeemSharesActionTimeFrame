// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../../../fndz/interfaces/IReferralRegistry.sol";
import "./utils/FeeBase.sol";

/// @title EntranceReferralFee Contract
/// @notice A ReferralFee that transfers the fee shares to the referrer
contract EntranceReferralFee is FeeBase {
    using SafeMath for uint256;

    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate);

    event Settled(address indexed comptrollerProxy, address indexed payer, uint256 sharesQuantity);

    uint256 private constant RATE_DIVISOR = 10**18;

    // FNDZ Referral Registry Reference
    address private immutable REFERRAL_REGISTRY;

    mapping(address => uint256) private comptrollerProxyToRate;

    constructor(address _feeManager, address _referralRegistry) public FeeBase(_feeManager) {
        REFERRAL_REGISTRY = _referralRegistry;
    }

    // EXTERNAL FUNCTIONS

    /// @notice Add the fee settings for a fund
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settingsData Encoded settings to apply to the policy for a fund
    function addFundSettings(address _comptrollerProxy, bytes calldata _settingsData)
        external
        override
        onlyFeeManager
    {
        uint256 rate = abi.decode(_settingsData, (uint256));
        require(rate > 0, "addFundSettings: Fee rate must be >0");

        comptrollerProxyToRate[_comptrollerProxy] = rate;

        emit FundSettingsAdded(_comptrollerProxy, rate);
    }

    /// @notice Provides a constant string identifier for a fee
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "ENTRANCE_REFERRAL_FEE";
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
        implementedHooksForSettle_[0] = IFeeManager.FeeHook.PostBuyShares;

        implementedHooksForUpdate_ = new IFeeManager.FeeHook[](1);
        implementedHooksForUpdate_[0] = IFeeManager.FeeHook.PreBuyShares;

        return (implementedHooksForSettle_, implementedHooksForUpdate_, false, false);
    }

    /// @notice Settles the fee
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _settlementData Encoded args to use in calculating the settlement
    /// @return settlementType_ The type of settlement
    /// @return payer_ The payer of shares due
    /// @return sharesDue_ The amount of shares due
    function settle(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook,
        bytes calldata _settlementData,
        uint256
    )
        external
        override
        onlyFeeManager
        returns (
            IFeeManager.SettlementType settlementType_,
            address payer_,
            uint256 sharesDue_
        )
    {
        uint256 sharesBought;
        (payer_, , sharesBought) = __decodePostBuySharesSettlementData(_settlementData);

        uint256 rate = comptrollerProxyToRate[_comptrollerProxy];
        sharesDue_ = sharesBought.mul(rate).div(RATE_DIVISOR.add(rate));

        bool isReferred = IReferralRegistry(REFERRAL_REGISTRY).isReferredAddress(
            _vaultProxy,
            payer_
        );

        if (sharesDue_ == 0 || !isReferred) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        emit Settled(_comptrollerProxy, payer_, sharesDue_);
        return (IFeeManager.SettlementType.DirectToReferrer, payer_, sharesDue_);
    }

    /// @notice Updates the fee state after all fees have finished settle()
    /// @dev Updated the referral if referrer exist in settlementData
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _settlementData Encoded args to use in calculating the settlement update
    function update(
        address,
        address _vaultProxy,
        IFeeManager.FeeHook,
        bytes calldata _settlementData,
        uint256
    ) external override onlyFeeManager {
        address payer;
        address referrer;
        (payer, , , referrer) = __decodePreBuySharesSettlementData(_settlementData);

        if (referrer != address(0)) {
            IReferralRegistry(REFERRAL_REGISTRY).updateReferral(_vaultProxy, referrer, payer);
        }
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `rate` variable for a fund
    /// @param _comptrollerProxy The ComptrollerProxy contract for the fund
    /// @return rate_ The `rate` variable value
    function getRateForFund(address _comptrollerProxy) external view returns (uint256 rate_) {
        return comptrollerProxyToRate[_comptrollerProxy];
    }
}
