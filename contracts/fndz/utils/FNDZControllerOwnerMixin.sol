// SPDX-License-Identifier: GPL-3.0

/*
    This file is part of the FNDZ Protocol.

    (c) FNDZ Council <council@fndz.io>
    (c) Enzyme Council <council@enzyme.finance>

    For the full license information, please view the LICENSE
    file that was distributed with this source code.
*/

pragma solidity 0.6.12;

import "../interfaces/IFNDZController.sol";

/// @title FNDZControllerOwnerMixin Contract
/// @author FNDZ Council <council@fndz.io>
/// @notice A mixin contract that defers ownership to the owner of FNDZController
abstract contract FNDZControllerOwnerMixin {
    address internal immutable FNDZ_CONTROLLER;

    modifier onlyFNDZControllerOwner() {
        require(
            msg.sender == getFNDZControllerOwner(),
            "onlyFNDZControllerOwner: Only the FNDZController owner can call this function"
        );
        _;
    }

    constructor(address _fndzController) public {
        FNDZ_CONTROLLER = _fndzController;
    }

    /// @notice Gets the owner of this contract
    /// @return owner_ The owner
    /// @dev Ownership is deferred to the owner of the FNDZController contract
    function getFNDZControllerOwner() public view returns (address owner_) {
        return IFNDZController(FNDZ_CONTROLLER).getOwner();
    }

    ///////////////////
    // STATE GETTERS //
    ///////////////////

    /// @notice Gets the `FNDZ_CONTROLLER` variable
    /// @return fndzController_ The `FNDZ_CONTROLLER` variable value
    function getFNDZController() external view returns (address fndzController_) {
        return FNDZ_CONTROLLER;
    }
}
