// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "../../../../fndz/interfaces/IFNDZInvestmentRegistry.sol";
import "./utils/FeeBase.sol";

/// @title FNDZInvestmenttFee Contract
/// @notice A Investor Fee of FNDZ that splits the shares received and
/// swap it to the FNDZ Token while deposit and lock the FNDZ tokens
/// The locked FNDZ Tokens will be deducted while withdraw
contract FNDZInvestmentFee is FeeBase {
    using SafeMath for uint256;

    struct FeeInfo {
        uint256 rate;
        uint256 balanceBeforeSettlement;
    }

    // Events
    event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate);
    event Settled(
        address indexed comptrollerProxy,
        address indexed payer,
        uint256 investmentQuantity
    );
    event LockedBalanceUpdated(address comptrollerProxy, uint256 oldBalance, uint256 newBalance);

    uint256 private constant RATE_DIVISOR = 10**18;
    address public immutable FNDZ_TOKEN;
    address public immutable FNDZ_INVESTMENT_REGISTRY;
    mapping(address => FeeInfo) private comptrollerProxyToFeeInfo;

    constructor(
        address _feeManager,
        address _fndzToken,
        address _fndzInvestmentRegistry
    ) public FeeBase(_feeManager) {
        FNDZ_TOKEN = _fndzToken;
        FNDZ_INVESTMENT_REGISTRY = _fndzInvestmentRegistry;
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

        comptrollerProxyToFeeInfo[_comptrollerProxy] = FeeInfo(rate, 0);

        emit FundSettingsAdded(_comptrollerProxy, rate);
    }

    /// @notice Provides a constant string identifier for a fee
    /// @return identifier_ The identifier string
    function identifier() external pure override returns (string memory identifier_) {
        return "FNDZ_INVESTMENT_FEE";
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

        implementedHooksForUpdate_ = new IFeeManager.FeeHook[](4);
        implementedHooksForUpdate_[0] = IFeeManager.FeeHook.BuySharesSetup;
        implementedHooksForUpdate_[1] = IFeeManager.FeeHook.BuySharesCompleted;
        implementedHooksForUpdate_[2] = IFeeManager.FeeHook.PostRedeemShares;
        implementedHooksForUpdate_[3] = IFeeManager.FeeHook.PostContinuous;

        return (implementedHooksForSettle_, implementedHooksForUpdate_, false, false);
    }

    /// @notice Settles the fee
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _settlementData Encoded args to use in calculating the settlement
    /// @return settlementType_ The type of settlement
    /// @return payer_ The investor
    /// @return investmentDue_ The amount of investment needs to be swapped
    function settle(
        address _comptrollerProxy,
        address,
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
            uint256 investmentDue_
        )
    {
        uint256 investmentAmount;
        (payer_, investmentAmount, ) = __decodePostBuySharesSettlementData(_settlementData);

        uint256 rate = comptrollerProxyToFeeInfo[_comptrollerProxy].rate;
        investmentDue_ = investmentAmount.mul(rate).div(RATE_DIVISOR);

        if (investmentDue_ == 0) {
            return (IFeeManager.SettlementType.None, address(0), 0);
        }

        emit Settled(_comptrollerProxy, payer_, investmentDue_);
        return (IFeeManager.SettlementType.BuyToLockFNDZ, payer_, investmentDue_);
    }

    /// @notice Updates the fee state after all fees have finished settle()
    /// @dev Updated the Locked amount of FNDZ token after settle and post withdraw
    /// @param _comptrollerProxy The ComptrollerProxy of the fund
    /// @param _vaultProxy The VaultProxy of the fund
    /// @param _hook The FeeHook being executed
    function update(
        address _comptrollerProxy,
        address _vaultProxy,
        IFeeManager.FeeHook _hook,
        bytes calldata,
        uint256
    ) external override onlyFeeManager {
        if (_hook == IFeeManager.FeeHook.BuySharesSetup) {
            comptrollerProxyToFeeInfo[_comptrollerProxy].balanceBeforeSettlement = ERC20(
                FNDZ_TOKEN
            )
                .balanceOf(_vaultProxy);
            return;
        }

        uint256 currentBalance = ERC20(FNDZ_TOKEN).balanceOf(_vaultProxy);

        IFNDZInvestmentRegistry fndzInvestmentRegistry = IFNDZInvestmentRegistry(
            FNDZ_INVESTMENT_REGISTRY
        );
        uint256 prevLockedAmount = fndzInvestmentRegistry.getLockedAmount(_vaultProxy);

        uint256 currentLockedAmount;
        if (_hook == IFeeManager.FeeHook.BuySharesCompleted) {
            // The current balance can be lesser than the balance before settlement.
            // Because, FNDZ tokens in the vault holdings can be transferred to the fndz staking pool
            // when settling management fee through inline swap. So calculating the balanceDue
            // based on the values of current FNDZ balance and the FNDZ balance before settlement of all the fees
            uint256 balanceDue;
            if (
                currentBalance <
                comptrollerProxyToFeeInfo[_comptrollerProxy].balanceBeforeSettlement
            ) {
                balanceDue = 0;
            } else {
                balanceDue =
                    currentBalance -
                    comptrollerProxyToFeeInfo[_comptrollerProxy].balanceBeforeSettlement;
            }
            currentLockedAmount = Math.min(prevLockedAmount, currentBalance) + balanceDue;
        } else if (
            _hook == IFeeManager.FeeHook.PostRedeemShares ||
            _hook == IFeeManager.FeeHook.PostContinuous
        ) {
            currentLockedAmount = Math.min(prevLockedAmount, currentBalance);
        }

        fndzInvestmentRegistry.updateLockedAmount(_vaultProxy, currentLockedAmount);
        emit LockedBalanceUpdated(_comptrollerProxy, prevLockedAmount, currentLockedAmount);
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the FeeInfo of the fund
    /// @param _comptrollerProxy The ComptrollerProxy contract address of the fund
    /// @return feeInfo_ The FeeInfo of the fund
    function getFeeInfoForFund(address _comptrollerProxy)
        external
        view
        returns (FeeInfo memory feeInfo_)
    {
        return comptrollerProxyToFeeInfo[_comptrollerProxy];
    }
}
