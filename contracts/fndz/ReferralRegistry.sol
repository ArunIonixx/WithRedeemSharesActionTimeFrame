// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../release/extensions/fee-manager/IFee.sol";
import "./interfaces/IReferralRegistry.sol";

contract ReferralRegistry is IReferralRegistry, OwnableUpgradeable {
    address public feeAddress;
    mapping(address => mapping(address => address)) private vaultProxyToRefereeToReferrer;

    modifier onlyFromFee {
        require(msg.sender == feeAddress, "only accessible to the Fee contract");
        _;
    }

    // Events
    event FeeAddressSet(address _old, address _new);
    event ReferralAdded(address vaultProxy, address referrer, address referee);

    function initialize() public initializer {
        __Ownable_init();
    }

    /// @notice This method helps to update a referral of the depositor
    /// It wont update the referrer if the referee is already referred
    /// @param _referrer - Address of the Referrer
    /// @param _referee - Address of the Referee who invests
    function updateReferral(
        address _vaultProxy,
        address _referrer,
        address _referee
    ) external override onlyFromFee {
        if (!__isReferredAddress(_vaultProxy, _referee)) {
            __addReferral(_vaultProxy, _referrer, _referee);
        }
    }

    /// @notice This method veifies whether the referrer exist to the referee for a fund
    /// @param _vaultProxy vault proxy address of the Fund
    /// @param _referee the address which is being referred
    function isReferredAddress(address _vaultProxy, address _referee)
        external
        view
        override
        returns (bool)
    {
        return __isReferredAddress(_vaultProxy, _referee);
    }

    /// @notice This method returns the referrer address of the referee of a Fund
    /// @param _vaultProxy vault proxy address of the Fund
    /// @param _referee the address which is being referred
    function getReferrer(address _vaultProxy, address _referee)
        external
        view
        override
        returns (address _referrer)
    {
        require(
            vaultProxyToRefereeToReferrer[_vaultProxy][_referee] != address(0),
            "getReferral: address is not referred"
        );

        return vaultProxyToRefereeToReferrer[_vaultProxy][_referee];
    }

    /// @notice Set the fee address of the FNDZInvestFee.
    /// To restrict the access to that fee alone
    /// @param _feeAddress - address of the fee
    function setFeeAddress(address _feeAddress) external onlyOwner {
        require(_feeAddress != address(0), "_feeAddress can not be zero address");
        require(_feeAddress != feeAddress, "_feeAddress already set");

        address old = feeAddress;
        feeAddress = _feeAddress;
        emit FeeAddressSet(old, _feeAddress);
    }

    ///////////////////////
    // Private Functions //
    ///////////////////////

    /// @notice Helper private function to add a referral
    function __addReferral(
        address _vaultProxy,
        address _referrer,
        address _referee
    ) private {
        require(_referrer != _referee, "__addReferral: _referrer and _referee should not be same");
        require(
            vaultProxyToRefereeToReferrer[_vaultProxy][_referee] == address(0),
            "__addReferral: address is already referred"
        );
        require(
            _referrer != address(0) && _referee != address(0),
            "__addReferral: address is empty"
        );

        vaultProxyToRefereeToReferrer[_vaultProxy][_referee] = _referrer;
        emit ReferralAdded(_vaultProxy, _referrer, _referee);
    }

    /// @notice Helper private function to verify a referral
    function __isReferredAddress(address _vaultProxy, address _referee)
        private
        view
        returns (bool)
    {
        return vaultProxyToRefereeToReferrer[_vaultProxy][_referee] != address(0);
    }
}
