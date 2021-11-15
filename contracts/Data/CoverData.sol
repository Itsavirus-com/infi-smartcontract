// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

contract CoverData is Master {
    // State Variables
    InsuranceCover[] internal covers; // InsuranceCover.id
    mapping(address => uint256[]) internal holderToCovers;
    mapping(address => uint256[]) internal funderToCovers;
    mapping(address => uint256[]) internal funderToRequestId;
    mapping(uint256 => uint256[]) internal offerIdToCovers;
    mapping(uint256 => uint256[]) internal requestIdToCovers;
    mapping(uint256 => bool) public isPremiumCollected; //  coverId -> true/false
    mapping(uint256 => uint8) public coverIdToCoverMonths; // Only for Buy Cover / Take Offer
    mapping(uint256 => uint256) public insuranceCoverStartAt; // Only for Buy Cover / Take Offer
    CoverFunding[] internal coverFundings;
    mapping(uint256 => uint256[]) internal requestIdToCoverFundings;
    mapping(address => uint256[]) internal funderToCoverFundings;
    // Funder Address ||--< coverId => true/false
    mapping(address => mapping(uint256 => bool)) public isFunderOfCover;
    // Mapping offer to the most last cover end time
    mapping(uint256 => uint256) public offerIdToLastCoverEndTime;

    // Events
    event Cover(
        uint256 id,
        InsuranceCover cover,
        uint256 startAt,
        uint8 coverMonths,
        address funder
    );
    event Booking(uint256 id, CoverFunding coverFunding);
    event CoverPremiumCollected(uint256 coverId);

    /**
     * @dev Save cover data when user take offer
     */
    function storeCoverByTakeOffer(
        InsuranceCover memory cover,
        uint8 coverMonths,
        address funder
    ) external {
        covers.push(cover);
        uint256 coverId = covers.length - 1;
        offerIdToCovers[cover.offerId].push(coverId);
        holderToCovers[cover.holder].push(coverId);
        funderToCovers[funder].push(coverId);
        coverIdToCoverMonths[coverId] = coverMonths;
        insuranceCoverStartAt[coverId] = block.timestamp;
        isPremiumCollected[coverId] = true;
        isFunderOfCover[funder][coverId] = true;

        // Update the most last cover end time
        uint256 endAt = block.timestamp + (uint256(coverMonths) * 30 days);
        if (endAt > offerIdToLastCoverEndTime[cover.offerId]) {
            offerIdToLastCoverEndTime[cover.offerId] = endAt;
        }

        emit Cover(coverId, cover, block.timestamp, coverMonths, funder);
        emit CoverPremiumCollected(coverId);

        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Save cover data when user take request
     */
    function storeBookingByTakeRequest(CoverFunding memory booking) external {
        coverFundings.push(booking);
        uint256 coverFundingId = coverFundings.length - 1;
        requestIdToCoverFundings[booking.requestId].push(coverFundingId);
        funderToCoverFundings[booking.funder].push(coverFundingId);
        emit Booking(coverFundingId, booking);

        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Save cover data when user take request
     */
    function storeCoverByTakeRequest(
        InsuranceCover memory cover,
        uint8 coverMonths,
        address funder
    ) external {
        covers.push(cover);
        uint256 coverId = covers.length - 1;
        requestIdToCovers[cover.requestId].push(coverId);
        holderToCovers[cover.holder].push(coverId);
        funderToCovers[funder].push(coverId);
        funderToRequestId[funder].push(cover.requestId);
        isFunderOfCover[funder][coverId] = true;
        emit Cover(coverId, cover, 0, coverMonths, funder);
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Get cover detail
     */
    function getCoverById(uint256 coverId)
        external
        view
        returns (InsuranceCover memory cover)
    {
        cover = covers[coverId];
    }

    /**
     * @dev Get booking detail
     */
    function getBookingById(uint256 bookingId)
        external
        view
        returns (CoverFunding memory coverFunding)
    {
        coverFunding = coverFundings[bookingId];
    }

    /**
     * @dev get cover months for cover that crated from take offer only
     */
    function getCoverMonths(uint256 coverId) external view returns (uint8) {
        return coverIdToCoverMonths[coverId];
    }

    /**
     * @dev get list of cover id over covef offer
     */
    function getCoversByOfferId(uint256 offerId)
        external
        view
        returns (uint256[] memory)
    {
        return offerIdToCovers[offerId];
    }

    /**
     * @dev get list of cover id(s) that funded by member
     */
    function getFunderToCovers(address member)
        external
        view
        returns (uint256[] memory)
    {
        return funderToCovers[member];
    }

    /**
     * @dev called when funder collected premium over success cover
     */
    function setPremiumCollected(uint256 coverId) external {
        isPremiumCollected[coverId] = true;
        emit CoverPremiumCollected(coverId);
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev get list of cover id(s) over Cover Request
     */
    function getCoversByRequestId(uint256 requestId)
        external
        view
        returns (uint256[] memory)
    {
        return requestIdToCovers[requestId];
    }

    /**
     * @dev get list of cover request id(s) that funded by member
     */
    function getFunderToRequestId(address funder)
        external
        view
        returns (uint256[] memory)
    {
        return funderToRequestId[funder];
    }
}
