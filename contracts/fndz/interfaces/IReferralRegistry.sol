// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

/// @title IReferralRegistry Interface
interface IReferralRegistry {
    function updateReferral(
        address _vaultProxy,
        address _referrer,
        address _referee
    ) external;

    function isReferredAddress(address _vaultProxy, address _referee) external view returns (bool);

    function getReferrer(address _vaultProxy, address _referee)
        external
        view
        returns (address _referrer);
}
