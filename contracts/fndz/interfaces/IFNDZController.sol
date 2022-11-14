// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

interface IFNDZController {
    function getInlineSwapRouterAddress() external view returns (address);

    function getOwner() external view returns (address);

    function getParaSwapFee() external view returns (uint256);

    function fndzDao() external view returns (address);

    function fndzToken() external view returns (address);

    function getFNDZShortingBotAddress()external view returns (address);

    function getManagementFeeData()
        external
        view
        returns (
            address,
            address,
            uint256,
            uint256,
            uint256
        );

    function getPerformanceFeeData(address _vaultOwner)
        external
        view
        returns (
            address,
            address,
            uint256,
            uint256,
            uint256
        );

    function getFeeInlineSwapData()
        external
        view
        returns (
            address,
            address,
            uint256,
            uint256,
            uint256
        );
}
