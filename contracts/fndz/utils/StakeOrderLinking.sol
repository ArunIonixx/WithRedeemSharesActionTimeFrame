// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

/// @notice - This contract helps to form a doubly linked list of stake holders
/// It will for the link as "address1 <-> address2 <-> .... <-> addressN"
/// By adding and removing the stake holder from the link whenever
/// the user stake, unstake, or withdraw to keep it stable.
/// @dev - This structure is mainly used to figure out the first stake holder's staked time
/// to calculate the maximum days staked of the staking pool
abstract contract StakeOrderLinking {
    // Structure to store the previous and next stakeholders
    struct StakeOrderLink {
        address prevStakeholder;
        address nextStakeholder;
    }

    modifier notZeroAddress(address _address) {
        require(_address != address(0), "Address should not be a zero address");
        _;
    }

    // State Variables to save the stakeholders' addresses as a Doubly Linked List
    mapping(address => StakeOrderLink) public stakeholderToStakeOrderLink;
    address public firstStakeholder; // To store first address of the link
    address public lastStakeholder; // To store the last address of the link

    /// @notice - Helper method to add a stakeholder address into the stake order link.
    /// it will append the stakeholder at the end of the link
    /// @dev - should be only used while staking
    /// @param _stakeholder - address of the stakeholder
    function __addToStakeOrderLink(address _stakeholder) internal notZeroAddress(_stakeholder) {
        require(
            (firstStakeholder != lastStakeholder || _stakeholder != firstStakeholder) &&
                stakeholderToStakeOrderLink[_stakeholder].prevStakeholder == address(0) &&
                stakeholderToStakeOrderLink[_stakeholder].nextStakeholder == address(0),
            "stakeholder address already present in the link"
        );

        if (firstStakeholder == address(0)) {
            firstStakeholder = _stakeholder;
        }

        if (lastStakeholder != address(0)) {
            stakeholderToStakeOrderLink[lastStakeholder].nextStakeholder = _stakeholder;
        }

        stakeholderToStakeOrderLink[_stakeholder] = StakeOrderLink(lastStakeholder, address(0));
        lastStakeholder = _stakeholder;
    }

    /// @notice - Helper method to remove a stakeholder address from the link.
    /// it will join the prev and next stakeholder address to make the link intact
    /// @dev - should be only used whenever the stakeholder unstaking or withdrawing all the stakes
    /// @param _stakeholder - address of the staker
    function __removeFromStakeOrderLink(address _stakeholder)
        internal
        notZeroAddress(_stakeholder)
    {
        StakeOrderLink memory link = stakeholderToStakeOrderLink[_stakeholder];
        require(
            (firstStakeholder == lastStakeholder && _stakeholder == firstStakeholder) ||
                link.prevStakeholder != address(0) ||
                link.nextStakeholder != address(0),
            "stakeholder address not present in the link"
        );

        if (link.prevStakeholder != address(0)) {
            stakeholderToStakeOrderLink[link.prevStakeholder].nextStakeholder = link
                .nextStakeholder;
        } else {
            firstStakeholder = link.nextStakeholder;
        }

        if (link.nextStakeholder != address(0)) {
            stakeholderToStakeOrderLink[link.nextStakeholder].prevStakeholder = link
                .prevStakeholder;
        } else {
            lastStakeholder = link.prevStakeholder;
        }

        delete stakeholderToStakeOrderLink[_stakeholder];
    }
}
