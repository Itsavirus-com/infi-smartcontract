// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {ICoverData} from "../Interfaces/ICoverData.sol";
import {IClaimData} from "../Interfaces/IClaimData.sol";
import {IListingData} from "../Interfaces/IListingData.sol";
import {IPlatformData} from "../Interfaces/IPlatformData.sol";
import {ICoverGateway} from "../Interfaces/ICoverGateway.sol";
import {IListingGateway} from "../Interfaces/IListingGateway.sol";
import {IClaimGateway} from "../Interfaces/IClaimGateway.sol";
import {IPool} from "../Interfaces/IPool.sol";
import {IClaimHelper} from "../Interfaces/IClaimHelper.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";

contract ClaimGateway is IClaimGateway, Pausable {
    // State variables
    ICoverGateway public coverGateway;
    IListingGateway public listingGateway;
    ICoverData public coverData;
    IClaimData public claimData;
    IListingData public listingData;
    IPlatformData public platformData;
    IPool public pool;
    IClaimHelper public claimHelper;
    uint256 private constant PHASE_OFFSET = 64;
    uint256 private constant STABLECOINS_STANDARD_PRICE = 1;

    // Events
    event CollectPremium(
        uint256 requestId,
        uint256 coverId,
        address funder,
        uint8 currencyType,
        uint256 totalPremium
    );
    event RefundPremium(
        uint256 requestId,
        address funder,
        uint8 currencyType,
        uint256 totalPremium
    );
    event TakeBackDeposit(
        uint256 offerId,
        address funder,
        uint8 currencyType,
        uint256 totalDeposit
    );
    event RefundDeposit(
        uint256 requestId,
        uint256 coverId,
        address funder,
        uint8 currencyType,
        uint256 totalDeposit
    );
    event ValidClaim(
        uint256 coverId,
        uint256 claimId,
        uint8 payoutCurrency,
        uint256 totalPayout
    );
    event InvalidClaim(uint256 coverId, uint256 claimId);
    // Dev withdraw expired payout
    event WithdrawExpiredPayout(
        address devWallet,
        uint8 currencyType,
        uint256 amount
    );

    modifier onlyAdmin() {
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );
        _;
    }

    function pause() public onlyAdmin whenNotPaused {
        _pause();
    }

    function unpause() public onlyAdmin whenPaused {
        _unpause();
    }

    function changeDependentContractAddress() external {
        // Only admin allowed to call this function
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );

        coverGateway = ICoverGateway(cg.getLatestAddress("CG"));
        listingGateway = IListingGateway(cg.getLatestAddress("LG"));
        coverData = ICoverData(cg.getLatestAddress("CD"));
        claimData = IClaimData(cg.getLatestAddress("CM"));
        listingData = IListingData(cg.getLatestAddress("LD"));
        platformData = IPlatformData(cg.getLatestAddress("PD"));
        pool = IPool(cg.getLatestAddress("PL"));
        claimHelper = IClaimHelper(cg.getLatestAddress("CH"));
    }

    /**
     * @dev Called when member make claim over cover, that cover come from take offer
     * @param coverId id of cover
     * @param roundId number attribute from subgraph
     */
    function submitClaim(uint256 coverId, uint80 roundId)
        external
        whenNotPaused
    {
        // msg.sender must cover's owner
        InsuranceCover memory cover = coverData.getCoverById(coverId);
        require(cover.holder == msg.sender, "ERR_CLG_1");

        // Only accept coverId that coming from taje offer
        require(cover.listingType == ListingType.OFFER, "ERR_CLG_27");

        // get startAt & endAt of Cover
        uint256 startAt = coverGateway.getStartAt(coverId);
        uint256 endAt = coverGateway.getEndAt(coverId);

        // cover must start
        require(startAt != 0, "ERR_CLG_2");

        // cover must be still active
        require(
            startAt <= block.timestamp && block.timestamp <= endAt,
            "ERR_CLG_3"
        );

        // Make sure there is no valid claim
        // Limit only able to make 1 valid claim &$ cannot make multiple valid claim
        require(!claimData.isValidClaimExistOnCover(coverId), "ERR_CLG_4");

        // Cannot use same roundId to submit claim on cover
        require(!claimData.coverIdToRoundId(coverId, roundId), "ERR_CLG_5");

        // Update Cover to roundId
        claimData.setCoverIdToRoundId(coverId, roundId);

        // Price feed aggregator
        address priceFeedAddr = claimHelper.getPriceFeedAddress(cover);
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddr);
        // Call aggregator
        (, , , uint256 eventTimestamp, ) = priceFeed.getRoundData(roundId);

        // validate timestamp of price feed, time of round id must in range of cover period
        require(
            startAt <= eventTimestamp && eventTimestamp <= endAt,
            "ERR_CLG_6"
        );

        // Check 1 hours before roundId, make sure the devaluation id valid
        require(
            claimHelper.isValidPastDevaluation(priceFeedAddr, roundId),
            "ERR_CLG_7"
        );

        // add filing claim
        uint256 claimId = claimData.addClaim(
            coverId,
            cover.offerId,
            roundId,
            eventTimestamp,
            msg.sender
        );

        // + 1 hours is a buffer time
        if (
            (eventTimestamp + cg.monitoringPeriod()) + 1 hours <=
            block.timestamp
        ) {
            // Check validity and make payout
            _checkValidityAndPayout(claimId, priceFeedAddr);
        }
    }

    /**
     * @dev Called by insurance holder for check claim status over cover, that cover come from take offer
     */
    function checkPayout(uint256 claimId) external override whenNotPaused {
        uint256 coverId = claimData.claimToCover(claimId);

        // make sure there is no valid claim
        require(!claimData.isValidClaimExistOnCover(coverId), "ERR_CLG_4");

        Claim memory claim = claimData.getClaimById(claimId);
        InsuranceCover memory cover = coverData.getCoverById(coverId);

        // Price feed aggregator
        address priceFeedAddr = claimHelper.getPriceFeedAddress(cover);
        // Call aggregator
        (, , uint256 startedAt, , ) = AggregatorV3Interface(priceFeedAddr)
            .getRoundData(claim.roundId);

        require(
            ((startedAt + cg.monitoringPeriod()) + 1 hours) < block.timestamp,
            "ERR_CLG_8"
        );

        require(
            block.timestamp <=
                (startedAt + cg.monitoringPeriod() + cg.maxPayoutPeriod()),
            "ERR_CLG_9"
        );

        _checkValidityAndPayout(claimId, priceFeedAddr);
    }

    /**
     * @dev Check validity status of pending claim
     */
    function _checkValidityAndPayout(uint256 claimId, address priceFeedAddr)
        internal
    {
        Claim memory claim = claimData.getClaimById(claimId);

        // For stablecoins devaluation will decided based on oracle
        (bool isClaimValid, uint256 assetPrice, uint8 decimals) = claimHelper
            .checkClaimForDevaluation(priceFeedAddr, claim.roundId);

        // Get Cover id
        uint256 coverId = claimData.claimToCover(claimId);
        InsuranceCover memory cover = coverData.getCoverById(coverId);

        if (isClaimValid) {
            // Calculate Payout
            uint256 payout = claimHelper.getPayoutOfCover(
                cover,
                assetPrice,
                decimals
            );

            // Get cover offer
            CoverOffer memory coverOffer = listingData.getCoverOfferById(
                cover.offerId
            );

            // emit event
            emit ValidClaim(
                coverId,
                claimId,
                uint8(coverOffer.insuredSumCurrency),
                payout
            );

            require(
                claimData.coverToPayout(coverId) + payout <= cover.insuredSum,
                "ERR_CLG_10"
            );

            // Set cover to payout
            claimData.setCoverToPayout(coverId, payout);
            // Update total payout of offer cover
            claimData.setOfferIdToPayout(cover.offerId, payout);

            // send payout
            pool.transferAsset(
                cover.holder,
                coverOffer.insuredSumCurrency,
                payout
            );

            // update state of claim
            claimData.updateClaimState(
                claimId,
                cover.offerId,
                ClaimState.VALID
            );
        } else {
            // emit event
            emit InvalidClaim(coverId, claimId);

            // update state of claim
            claimData.updateClaimState(
                claimId,
                cover.offerId,
                ClaimState.INVALID
            );
        }
    }

    /**
     * @dev will only be able to call by funders of cover request to collect premium from holder
     */
    function collectPremiumOfRequestByFunder(uint256 coverId)
        external
        override
        whenNotPaused
    {
        InsuranceCover memory cover = coverData.getCoverById(coverId);
        // Make sure cover coming from provide request
        require(cover.listingType == ListingType.REQUEST, "ERR_CLG_11");
        // check if request is fully funded or (reach target and passing expired date)
        require(
            coverGateway.isRequestCoverSucceed(cover.requestId),
            "ERR_CLG_2"
        );

        // check if msg.sender is funder of cover
        require(coverData.isFunderOfCover(msg.sender, coverId), "ERR_CLG_12");

        // check if funder already collect premium for request
        require(!coverData.isPremiumCollected(coverId), "ERR_CLG_13");

        CoverRequest memory coverRequest = listingData.getCoverRequestById(
            cover.requestId
        );

        // calculate premium for funder
        // formula : (fund provide by funder / insured sum of request) * premium sum
        uint256 totalPremium = (cover.insuredSum * coverRequest.premiumSum) /
            coverRequest.insuredSum;

        // Calcuclate Premium for Provider/Funder (80%) and Dev (20%)
        uint256 premiumToProvider = (totalPremium * 8) / 10;
        uint256 premiumToDev = totalPremium - premiumToProvider;

        // trigger event
        emit CollectPremium(
            cover.requestId,
            coverId,
            msg.sender,
            uint8(coverRequest.premiumCurrency),
            premiumToProvider
        );

        // mark funder as premium collectors
        coverData.setPremiumCollected(coverId);

        // Send 80% to Provider/Funder
        pool.transferAsset(
            msg.sender,
            coverRequest.premiumCurrency,
            premiumToProvider
        );
        // Send 20% to Dev wallet
        pool.transferAsset(
            coverGateway.devWallet(),
            coverRequest.premiumCurrency,
            premiumToDev
        );
    }

    /**
     * @dev only be able to call by holder to refund premium on Cover Request
     */
    function refundPremium(uint256 requestId) external override whenNotPaused {
        CoverRequest memory coverRequest = listingData.getCoverRequestById(
            requestId
        );

        // only creator of request
        require(coverRequest.holder == msg.sender, "ERR_CLG_14");

        // check if already refund premium
        require(!listingData.requestIdToRefundPremium(requestId), "ERR_CLG_15");

        // check whethers request if success or fail
        // if request success & fully funded (either FULL FUNDING or PARTIAL FUNDING)
        // only the remaining premiumSum can be withdrawn
        // if request success & partiallly funded & time passing expired listing
        // only the remaining premiumSum can be withdrawn
        // if request unsuccessful & time passing expired listing
        // withdrawn all premium sum
        uint256 premiumWithdrawn;
        if (coverGateway.isRequestCoverSucceed(requestId)) {
            // withdraw remaining premium
            // formula : (remaining insured sum / insured sum of request) * premium sum
            premiumWithdrawn =
                ((coverRequest.insuredSum -
                    listingData.requestIdToInsuredSumTaken(requestId)) *
                    coverRequest.premiumSum) /
                coverRequest.insuredSum;
        } else if (
            !listingData.isRequestReachTarget(requestId) &&
            (block.timestamp > coverRequest.expiredAt)
        ) {
            // fail request, cover request creator will be able to refund all premium
            premiumWithdrawn = coverRequest.premiumSum;
        } else {
            // can be caused by request not fullfil criteria to start cover
            // and not yet reach expired time
            revert("ERR_CLG_16");
        }

        if (premiumWithdrawn != 0) {
            // emit event
            emit RefundPremium(
                requestId,
                msg.sender,
                uint8(coverRequest.premiumCurrency),
                premiumWithdrawn
            );

            // mark the request has been refunded
            listingData.setRequestIdToRefundPremium(requestId);

            // transfer asset
            pool.transferAsset(
                msg.sender,
                coverRequest.premiumCurrency,
                premiumWithdrawn
            );
        } else {
            revert("ERR_CLG_17");
        }
    }

    /**
     * @dev will be call by funder of offer cover will send back deposit that funder already spend for offer cover
     */
    function takeBackDepositOfCoverOffer(uint256 offerId)
        external
        override
        whenNotPaused
    {
        CoverOffer memory coverOffer = listingData.getCoverOfferById(offerId);
        // must call by funder/creator of offer cover
        require(msg.sender == coverOffer.funder, "ERR_CLG_18");

        // current time must passing lockup period
        require(block.timestamp > coverOffer.expiredAt, "ERR_CLG_19");

        // check is there any cover that still depend on this one
        require(
            coverData.offerIdToLastCoverEndTime(offerId) > 0 &&
                block.timestamp > coverData.offerIdToLastCoverEndTime(offerId),
            "ERR_CLG_20"
        );

        // check is pending claim exists
        require(claimData.offerToPendingClaims(offerId) == 0, "ERR_CLG_21");

        // check if already take back deposit
        require(!listingData.isDepositOfOfferTakenBack(offerId), "ERR_CLG_22");

        // check remaining deposit
        uint256 remainingDeposit = coverOffer.insuredSum -
            claimData.offerIdToPayout(offerId);

        if (remainingDeposit > 0) {
            // emit event
            emit TakeBackDeposit(
                offerId,
                msg.sender,
                uint8(coverOffer.insuredSumCurrency),
                remainingDeposit
            );

            // mark deposit already taken
            listingData.setDepositOfOfferTakenBack(offerId);

            // send remaining deposit
            pool.transferAsset(
                msg.sender,
                coverOffer.insuredSumCurrency,
                remainingDeposit
            );
        } else {
            revert("ERR_CLG_24");
        }
    }

    /**
     * @dev will be call by funder that provide a cover request will send back deposit that funder already spend for a cover request
     */
    function refundDepositOfProvideCover(uint256 coverId)
        external
        override
        whenNotPaused
    {
        InsuranceCover memory cover = coverData.getCoverById(coverId);
        // cover must be coming from provide request
        require(cover.listingType == ListingType.REQUEST, "ERR_CLG_24");
        // check if msg.sender is funders of request
        require(coverData.isFunderOfCover(msg.sender, coverId), "ERR_CLG_12");
        // check if already take back deposit
        require(!listingData.isDepositTakenBack(coverId), "ERR_CLG_22");

        // check is there any pending claims on Cover Request
        require(
            claimData.requestToPendingCollectiveClaims(cover.requestId) == 0,
            "ERR_CLG_21"
        );

        CoverRequest memory coverRequest = listingData.getCoverRequestById(
            cover.requestId
        );
        uint256 coverEndAt = coverGateway.getEndAt(coverId);

        // Cover Request is fail when request not reaching target & already passing listing expired time
        bool isCoverRequestFail = !listingData.isRequestReachTarget(
            cover.requestId
        ) && (block.timestamp > coverRequest.expiredAt);

        // Calculate payout for cover & Remaining deposit
        // Payout for the cover = Payout for request * cover.insuredSum / Insured Sum Taken
        uint256 coverToPayout = (claimData.requestIdToPayout(cover.requestId) *
            cover.insuredSum) /
            listingData.requestIdToInsuredSumTaken(cover.requestId);
        // Remaining deposit = Insured Sum - payout for the cover
        uint256 remainingDeposit = cover.insuredSum - coverToPayout;

        // If ( cover request succedd & cover already expired & there is remaining deposit )
        // or cover request fail
        // then able to refund all funding
        // Otherwise cannot do refund
        if (
            (coverGateway.isRequestCoverSucceed(cover.requestId) &&
                coverEndAt < block.timestamp &&
                (remainingDeposit > 0)) || isCoverRequestFail
        ) {
            // emit event
            emit RefundDeposit(
                cover.requestId,
                coverId,
                msg.sender,
                uint8(coverRequest.insuredSumCurrency),
                remainingDeposit
            );

            // mark cover as desposit already taken back
            listingData.setIsDepositTakenBack(coverId);

            // Set Cover Payout
            claimData.setCoverToPayout(coverId, coverToPayout);

            // send deposit
            pool.transferAsset(
                msg.sender,
                coverRequest.insuredSumCurrency,
                remainingDeposit
            );
        } else {
            revert("ERR_CLG_25");
        }
    }

    /**
     * @dev Only be able called by Developer to withdraw Valid Expired Payout
     */
    function withdrawExpiredPayout() external override whenNotPaused {
        // Only dev wallet address can call function
        require(msg.sender == cg.getLatestAddress("DW"), "ERR_AUTH_3");

        for (uint8 j = 0; j < uint8(CurrencyType.END_ENUM); j++) {
            uint256 amount = claimData.totalExpiredPayout(CurrencyType(j));
            if (amount > 0) {
                // Change the value
                claimData.resetTotalExpiredPayout(CurrencyType(j));
                // transfer
                pool.transferAsset(
                    cg.getLatestAddress("DW"),
                    CurrencyType(j),
                    amount
                );
                // Emit event
                emit WithdrawExpiredPayout(
                    cg.getLatestAddress("DW"),
                    uint8(CurrencyType(j)),
                    amount
                );
            }
        }
    }

    /**
     * @dev Check all pending claims over Cover based on Cover listing type and Funder
     */
    function validateAllPendingClaims(ListingType listingType, address funder)
        external
        override
    {
        // get list of listing id
        uint256[] memory listingIds = (listingType == ListingType.OFFER)
            ? listingData.getFunderToOffers(funder)
            : coverData.getFunderToRequestId(funder);

        // Loop and Validate expired pending claims on every listing id
        for (uint256 i = 0; i < listingIds.length; i++) {
            claimHelper.execExpiredPendingClaims(listingType, listingIds[i]);
        }
    }

    /**
     * @dev Check all pending claims over Cover based on Cover listing type and listing id(Cover Request Id/ Cover Offer Id)
     */
    function validatePendingClaims(ListingType listingType, uint256 listingId)
        external
        override
        whenNotPaused
    {
        // Validate expired pending claims
        claimHelper.execExpiredPendingClaims(listingType, listingId);
    }

    /**
     * @dev Check pending claims over Cover
     */
    function validatePendingClaimsByCover(uint256 coverId) external override {
        // Get Cover
        InsuranceCover memory cover = coverData.getCoverById(coverId);
        // Price feed aggregator address
        address priceFeedAddr = claimHelper.getPriceFeedAddress(cover);
        // Validate expired pending claims
        claimHelper.execExpiredPendingClaimsByCoverId(priceFeedAddr, coverId);
    }

    /**
     * @dev Check pending claims by claim id
     */
    function validatePendingClaimsById(uint256 claimId)
        external
        override
        whenNotPaused
    {
        // Validate expired pending claims
        claimHelper.checkValidityClaim(claimId);
    }
}
