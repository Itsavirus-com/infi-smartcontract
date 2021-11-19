// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

abstract contract ICoverData is Master {
    function isPremiumCollected(uint256) external view virtual returns (bool);

    function coverIdToCoverMonths(uint256)
        external
        view
        virtual
        returns (uint8);

    function insuranceCoverStartAt(uint256)
        external
        view
        virtual
        returns (uint256);

    function isFunderOfCover(address, uint256)
        external
        view
        virtual
        returns (bool);

    function offerIdToLastCoverEndTime(uint256)
        external
        view
        virtual
        returns (uint256);

    function storeCoverByTakeOffer(
        InsuranceCover memory cover,
        uint8 coverMonths,
        address funder
    ) external virtual;

    function storeBookingByTakeRequest(CoverFunding memory booking)
        external
        virtual;

    function storeCoverByTakeRequest(
        InsuranceCover memory cover,
        uint8 coverMonths,
        address funder
    ) external virtual;

    function getCoverById(uint256 coverId)
        external
        view
        virtual
        returns (InsuranceCover memory cover);

    function getBookingById(uint256 bookingId)
        external
        view
        virtual
        returns (CoverFunding memory coverFunding);

    function getCoverMonths(uint256 coverId)
        external
        view
        virtual
        returns (uint8);

    function getCoversByOfferId(uint256 offerId)
        external
        view
        virtual
        returns (uint256[] memory);

    function getFunderToCovers(address member)
        external
        view
        virtual
        returns (uint256[] memory);

    function setPremiumCollected(uint256 coverId) external virtual;

    function getCoversByRequestId(uint256 requestId)
        external
        view
        virtual
        returns (uint256[] memory);

    function getFunderToRequestId(address funder)
        external
        view
        virtual
        returns (uint256[] memory);
}
