// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
abstract contract IClaimGateway is Master {
    function checkPayout(uint256 claimId) external virtual;

    function collectPremiumOfRequestByFunder(uint256 coverId) external virtual;

    function refundPremium(uint256 requestId) external virtual;

    function takeBackDepositOfCoverOffer(uint256 offerId) external virtual;

    function refundDepositOfProvideCover(uint256 coverId) external virtual;

    function withdrawExpiredPayout() external virtual;

    function validateAllPendingClaims(ListingType listingType, address funder)
        external
        virtual;

    function validatePendingClaims(ListingType listingType, uint256 listingId)
        external
        virtual;

    function validatePendingClaimsByCover(uint256 coverId) external virtual;

    function validatePendingClaimsById(uint256 claimId) external virtual;
}
