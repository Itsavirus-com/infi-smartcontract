// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import {ICoverData} from "../Interfaces/ICoverData.sol";
import {IClaimData} from "../Interfaces/IClaimData.sol";
import {IListingData} from "../Interfaces/IListingData.sol";
import {IPlatformData} from "../Interfaces/IPlatformData.sol";
import {ICoverGateway} from "../Interfaces/ICoverGateway.sol";
import {IListingGateway} from "../Interfaces/IListingGateway.sol";
import {IClaimGateway} from "../Interfaces/IClaimGateway.sol";
import {IClaimHelper} from "../Interfaces/IClaimHelper.sol";
import {Master} from "../Master/Master.sol";
import {IPool} from "../Interfaces/IPool.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract CollectiveClaimGateway is Master {
    // State variables
    ICoverGateway private coverGateway;
    IListingGateway private listingGateway;
    IClaimGateway private claimGateway;
    ICoverData private coverData;
    IClaimData private claimData;
    IListingData private listingData;
    IPlatformData private platformData;
    IClaimHelper private claimHelper;
    IPool private pool;

    event CollectivePremium(
        address funder,
        uint8 currencyType,
        uint256 totalPremium
    );
    event CollectiveRefundPremium(
        address funder,
        uint8 currencyType,
        uint256 totalPremium
    );
    event CollectiveTakeBackDeposit(
        address funder,
        uint8 currencyType,
        uint256 totalDeposit
    );
    event CollectiveRefundDeposit(
        address funder,
        uint8 currencyType,
        uint256 totalDeposit
    );
    event ValidCollectiveClaim(
        uint256 requestId,
        uint256 collectiveClaimId,
        uint8 payoutCurrency,
        uint256 totalPayout
    );

    event InvalidCollectiveClaim(uint256 requestId, uint256 collectiveClaimId);

    function changeDependentContractAddress() external {
        // Only admin allowed to call this function
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );
        coverGateway = ICoverGateway(cg.getLatestAddress("CG"));
        listingGateway = IListingGateway(cg.getLatestAddress("LG"));
        claimGateway = IClaimGateway(cg.getLatestAddress("CL"));
        coverData = ICoverData(cg.getLatestAddress("CD"));
        claimData = IClaimData(cg.getLatestAddress("CM"));
        listingData = IListingData(cg.getLatestAddress("LD"));
        platformData = IPlatformData(cg.getLatestAddress("PD"));
        pool = IPool(cg.getLatestAddress("PL"));
        claimHelper = IClaimHelper(cg.getLatestAddress("CH"));
    }

    /**
     * @dev called by creater of request to make a claim
     */
    function collectiveSubmitClaim(uint256 requestId, uint80 roundId) external {
        // Make sure request is succedd request
        require(coverGateway.isRequestCoverSucceed(requestId), "ERR_CLG_25");

        CoverRequest memory coverRequest = listingData.getCoverRequestById(
            requestId
        );
        // cover must be still active
        uint256 startAt = listingData.isRequestFullyFunded(requestId)
            ? listingData.coverRequestFullyFundedAt(requestId)
            : coverRequest.expiredAt;
        require(
            startAt <= block.timestamp &&
                block.timestamp <=
                (startAt + (uint256(coverRequest.coverMonths) * 30 days)), // end at of request
            "ERR_CLG_3"
        );

        // Check request own by msg.sender
        require(coverRequest.holder == msg.sender, "ERR_CLG_14");

        // make sure there is no valid claim
        require(!claimData.isValidClaimExistOnRequest(requestId), "ERR_CLG_4");

        // Cannot use same roundId to submit claim on cover
        require(!claimData.requestIdToRoundId(requestId, roundId), "ERR_CLG_5");
        claimData.setRequestIdToRoundId(requestId, roundId);

        address priceFeedAddr = platformData.getOraclePriceFeedAddress(
            listingData.getCoverRequestById(requestId).coinId
        );

        // Call aggregator
        (, , , uint256 eventTimestamp, ) = AggregatorV3Interface(priceFeedAddr)
            .getRoundData(roundId);

        // validate timestamp of price feed, time of round id must in range of cover period
        require(
            startAt <= eventTimestamp &&
                eventTimestamp <=
                (startAt + (uint256(coverRequest.coverMonths) * 30 days)),
            "ERR_CLG_6"
        );

        // Check 1 hours before roundId, make sure the devaluation id valid
        require(
            claimHelper.isValidPastDevaluation(priceFeedAddr, roundId),
            "ERR_CLG_7"
        );

        uint256 collectiveClaimId = claimData.addCollectiveClaim(
            requestId,
            roundId,
            eventTimestamp,
            msg.sender
        );

        // + 1 hours is a buffer time
        if (
            (eventTimestamp + cg.monitoringPeriod()) + 1 hours <=
            block.timestamp
        ) {
            _checkValidityAndPayout(collectiveClaimId, priceFeedAddr);
        }
    }

    /**
     * @dev Check validity status of pending claim
     */
    function _checkValidityAndPayout(
        uint256 collectiveClaimId,
        address priceFeedAddr
    ) internal {
        CollectiveClaim memory collectiveClaim = claimData
            .getCollectiveClaimById(collectiveClaimId);

        // For stablecoins devaluation will decided based on oracle
        (bool isClaimValid, uint256 assetPrice, uint8 decimals) = claimHelper
            .checkClaimForDevaluation(priceFeedAddr, collectiveClaim.roundId);
        // Get Cover id
        uint256 requestId = claimData.collectiveClaimToRequest(
            collectiveClaimId
        );

        if (isClaimValid) {
            CoverRequest memory coverRequest = listingData.getCoverRequestById(
                requestId
            );
            // Calculate Payout
            uint256 payout = claimHelper.getPayoutOfRequest(
                requestId,
                coverRequest,
                assetPrice,
                decimals
            );

            require(
                payout <= listingData.requestIdToInsuredSumTaken(requestId),
                "ERR_CLG_10"
            );

            // emit event
            emit ValidCollectiveClaim(
                requestId,
                collectiveClaimId,
                uint8(coverRequest.insuredSumCurrency),
                payout
            );

            // Update total payout of offer request
            claimData.setRequestIdToPayout(requestId, payout);
            // send payout
            pool.transferAsset(
                coverRequest.holder,
                coverRequest.insuredSumCurrency,
                payout
            );
            // update state of claim
            claimData.updateCollectiveClaimState(
                collectiveClaimId,
                ClaimState.VALID
            );
        } else {
            // emit event
            emit InvalidCollectiveClaim(requestId, collectiveClaimId);
            // update state of claim
            claimData.updateCollectiveClaimState(
                collectiveClaimId,
                ClaimState.INVALID
            );
        }
    }

    /**
     * @dev function called by funder that provide on success cover request
     * function will send premium back to funder
     */
    function collectivePremiumForFunder() external {
        // Get list cover id of funder
        uint256[] memory listCoverIds = coverData.getFunderToCovers(msg.sender);

        // initialize variable for store total premium for each currency
        uint256[] memory totalPremium = new uint256[](
            uint8(CurrencyType.END_ENUM)
        );

        // loop each cover
        for (uint256 i = 0; i < listCoverIds.length; i++) {
            uint256 coverId = listCoverIds[i];
            InsuranceCover memory cover = coverData.getCoverById(coverId);

            // only success request cover & premium which not yet collected will be count
            if (
                cover.listingType == ListingType.REQUEST &&
                coverGateway.isRequestCoverSucceed(cover.requestId) &&
                !coverData.isPremiumCollected(coverId)
            ) {
                // mark cover as premium collecter
                coverData.setPremiumCollected(coverId);

                // increase total premium based on currency type (premium currency)
                CoverRequest memory coverRequest = listingData
                    .getCoverRequestById(cover.requestId);
                totalPremium[uint8(coverRequest.premiumCurrency)] +=
                    (cover.insuredSum * coverRequest.premiumSum) /
                    coverRequest.insuredSum;
            }
        }

        // loop every currency
        for (uint8 j = 0; j < uint8(CurrencyType.END_ENUM); j++) {
            if (totalPremium[j] > 0) {
                // Calcuclate Premium for Provider/Funder (80%) and Dev (20%)
                uint256 premiumToProvider = (totalPremium[j] * 8) / 10;
                uint256 premiumToDev = totalPremium[j] - premiumToProvider;

                // trigger event
                emit CollectivePremium(
                    msg.sender,
                    uint8(CurrencyType(j)),
                    premiumToProvider
                );

                // Send 80% to Provider/Funder
                pool.transferAsset(
                    msg.sender,
                    CurrencyType(j),
                    premiumToProvider
                );

                // Send 20% to Dev wallet
                pool.transferAsset(
                    coverGateway.devWallet(),
                    CurrencyType(j),
                    premiumToDev
                );
            }
        }
    }

    /**
     * @dev View function to return value of total amount of premium, amount of withdrawable premium for each stablecoins currency
     */
    function getWithdrawablePremiumData(address funderAddr)
        external
        view
        returns (
            uint256 totalWithdrawablePremiumInUSD,
            uint256[] memory withdrawablePremiumList,
            uint8 usdDecimals
        )
    {
        // Get list cover id of funder
        uint256[] memory listCoverIds = coverData.getFunderToCovers(funderAddr);

        // initialize variable for store total premium for each currency
        uint256[] memory totalPremium = new uint256[](
            uint8(CurrencyType.END_ENUM)
        );

        // loop each cover
        for (uint256 i = 0; i < listCoverIds.length; i++) {
            uint256 coverId = listCoverIds[i];
            InsuranceCover memory cover = coverData.getCoverById(coverId);

            // only success request cover & premium which not yet collected will be count
            if (
                cover.listingType == ListingType.REQUEST &&
                coverGateway.isRequestCoverSucceed(cover.requestId) &&
                !coverData.isPremiumCollected(coverId)
            ) {
                // increase total premium based on currency type (premium currency)
                CoverRequest memory coverRequest = listingData
                    .getCoverRequestById(cover.requestId);
                totalPremium[uint8(coverRequest.premiumCurrency)] +=
                    (cover.insuredSum * coverRequest.premiumSum) /
                    coverRequest.insuredSum;
            }
        }

        (totalWithdrawablePremiumInUSD, , usdDecimals) = claimHelper
            .convertPrice(totalPremium, totalPremium);

        return (totalWithdrawablePremiumInUSD, totalPremium, usdDecimals);
    }

    /**
     * @dev return total of premium and total of withdrawable premium
     * called by holder for refund premium from cover request
     */
    function getPremiumDataOfCoverRequest(address holderAddr)
        external
        view
        returns (
            uint256 totalWithdrawInUSD,
            uint256 totalLockPremiumInUSD,
            uint256[] memory withdrawablePremiumList,
            uint8 usdDecimals
        )
    {
        uint256[] memory withdrawablePremium = new uint256[](
            uint8(CurrencyType.END_ENUM)
        );

        uint256[] memory lockPremium = new uint256[](
            uint8(CurrencyType.END_ENUM)
        );

        // get list of request id that created by holder
        uint256[] memory listRequestIds = listingData.getBuyerToRequests(
            holderAddr
        );

        for (uint256 i = 0; i < listRequestIds.length; i++) {
            uint256 requestId = listRequestIds[i];
            CoverRequest memory coverRequest = listingData.getCoverRequestById(
                requestId
            );
            bool isRequestCoverSuccedd = coverGateway.isRequestCoverSucceed(
                requestId
            );
            // fail request is request that not react target and already passing listing expired time
            bool isFailRequest = !listingData.isRequestReachTarget(requestId) &&
                (block.timestamp > coverRequest.expiredAt);

            if (!listingData.requestIdToRefundPremium(requestId)) {
                if (isRequestCoverSuccedd || isFailRequest) {
                    withdrawablePremium[
                        uint8(coverRequest.premiumCurrency)
                    ] += (
                        isFailRequest
                            ? coverRequest.premiumSum
                            : (((coverRequest.insuredSum -
                                listingData.requestIdToInsuredSumTaken(
                                    requestId
                                )) * coverRequest.premiumSum) /
                                coverRequest.insuredSum)
                    );
                } else {
                    lockPremium[
                        uint8(coverRequest.premiumCurrency)
                    ] += coverRequest.premiumSum;
                }
            }
        }

        (totalWithdrawInUSD, totalLockPremiumInUSD, usdDecimals) = claimHelper
            .convertPrice(withdrawablePremium, lockPremium);

        return (
            totalWithdrawInUSD,
            totalLockPremiumInUSD,
            withdrawablePremium,
            usdDecimals
        );
    }

    /**
     * @dev function called by holder of failed cover request
     * @dev function will send premium back to holder
     */
    function collectiveRefundPremium() external {
        // get list of request id that created by holder
        uint256[] memory listRequestIds = listingData.getBuyerToRequests(
            msg.sender
        );
        uint256[] memory premiumWithdrawn = new uint256[](
            uint8(CurrencyType.END_ENUM)
        );

        for (uint256 i = 0; i < listRequestIds.length; i++) {
            uint256 requestId = listRequestIds[i];
            CoverRequest memory coverRequest = listingData.getCoverRequestById(
                requestId
            );
            bool isRequestCoverSuccedd = coverGateway.isRequestCoverSucceed(
                requestId
            );

            // fail request is request that not react target and already passing listing expired time
            bool isFailRequest = !listingData.isRequestReachTarget(requestId) &&
                (block.timestamp > coverRequest.expiredAt);

            // only request that
            // not yet refunded & (succedd request or fail request)
            // will count
            if (
                coverRequest.holder == msg.sender &&
                !listingData.requestIdToRefundPremium(requestId) &&
                (isRequestCoverSuccedd || isFailRequest)
            ) {
                // if fail request
                // then increase by CoverRequest.premiumSum a.k.a refund all premium
                // if cover succedd
                // then using formula : (remaining insured sum / insured sum of request) * premium sum
                // a.k.a only refund remaining premim sum
                premiumWithdrawn[uint8(coverRequest.premiumCurrency)] += (
                    isFailRequest
                        ? coverRequest.premiumSum
                        : (((coverRequest.insuredSum -
                            listingData.requestIdToInsuredSumTaken(requestId)) *
                            coverRequest.premiumSum) / coverRequest.insuredSum)
                );

                // mark request as refunded
                listingData.setRequestIdToRefundPremium(requestId);
            }
        }

        // loop every currency
        for (uint8 j = 0; j < uint8(CurrencyType.END_ENUM); j++) {
            if (premiumWithdrawn[j] > 0) {
                // emit event
                emit CollectiveRefundPremium(
                    msg.sender,
                    uint8(CurrencyType(j)),
                    premiumWithdrawn[j]
                );
                // transfer asset
                pool.transferAsset(
                    msg.sender,
                    CurrencyType(j),
                    premiumWithdrawn[j]
                );
            }
        }
    }

    /**
     * @dev return total of locked deposit and total of withdrawable deposit
     * called by funder
     */
    function getDepositDataOfOfferCover(address funderAddr)
        external
        view
        returns (
            uint256 totalWithdrawInUSD,
            uint256 totalLockDepositInUSD,
            uint256[] memory withdrawableDepositList,
            uint8 usdDecimals
        )
    {
        uint256[] memory withdrawableDeposit = new uint256[](
            uint8(CurrencyType.END_ENUM)
        );

        uint256[] memory lockDeposit = new uint256[](
            uint8(CurrencyType.END_ENUM)
        );

        // Get List Id of offers
        uint256[] memory listOfferIds = listingData.getFunderToOffers(
            funderAddr
        );

        for (uint256 i = 0; i < listOfferIds.length; i++) {
            // Get Offer Id
            uint256 offerId = listOfferIds[i];
            CoverOffer memory coverOffer = listingData.getCoverOfferById(
                offerId
            );

            if (!listingData.isDepositOfOfferTakenBack(offerId)) {
                if (
                    block.timestamp > coverOffer.expiredAt &&
                    (coverData.offerIdToLastCoverEndTime(offerId) > 0 &&
                        block.timestamp >
                        coverData.offerIdToLastCoverEndTime(offerId)) &&
                    (claimData.offerToPendingClaims(offerId) == 0)
                ) {
                    // Get Withdrawable Deposit a.k.a deposit that not locked
                    // deduct by by payout
                    withdrawableDeposit[uint8(coverOffer.insuredSumCurrency)] +=
                        coverOffer.insuredSum -
                        claimData.offerIdToPayout(offerId);
                } else {
                    // Get Lock Deposit deduct by by payout
                    lockDeposit[uint8(coverOffer.insuredSumCurrency)] +=
                        coverOffer.insuredSum -
                        claimData.offerIdToPayout(offerId);
                }
            }
        }

        (totalWithdrawInUSD, totalLockDepositInUSD, usdDecimals) = claimHelper
            .convertPrice(withdrawableDeposit, lockDeposit);

        return (
            totalWithdrawInUSD,
            totalLockDepositInUSD,
            withdrawableDeposit,
            usdDecimals
        );
    }

    /**
     * @dev function called by funder which creator of cover offer
     * function will send back deposit to funder
     */
    function collectiveRefundDepositOfCoverOffer() external {
        require(
            !claimHelper.isFunderHasPendingClaims(
                ListingType.OFFER,
                msg.sender
            ),
            "ERR_CLG_21"
        );
        // get list offer id of funder
        uint256[] memory listOfferIds = listingData.getFunderToOffers(
            msg.sender
        );
        uint256[] memory remainingDeposit = new uint256[](
            uint8(CurrencyType.END_ENUM)
        );

        for (uint256 i = 0; i < listOfferIds.length; i++) {
            uint256 offerId = listOfferIds[i];
            CoverOffer memory coverOffer = listingData.getCoverOfferById(
                offerId
            );

            // only cover offer that
            // passing listing expired time
            // & there is no active cover depend on the offer
            // & not yet take back deposit
            if (
                msg.sender == coverOffer.funder &&
                block.timestamp > coverOffer.expiredAt &&
                (coverData.offerIdToLastCoverEndTime(offerId) == 0 ||
                    block.timestamp >
                    coverData.offerIdToLastCoverEndTime(offerId)) &&
                !listingData.isDepositOfOfferTakenBack(offerId) &&
                (claimData.offerToPendingClaims(offerId) == 0)
            ) {
                // increase total deposit based on currency type (premium currency)
                remainingDeposit[uint8(coverOffer.insuredSumCurrency)] +=
                    coverOffer.insuredSum -
                    claimData.offerIdToPayout(offerId);

                // mark deposit already taken
                listingData.setDepositOfOfferTakenBack(offerId);
            }
        }

        // loop every currency
        for (uint8 j = 0; j < uint8(CurrencyType.END_ENUM); j++) {
            if (remainingDeposit[j] > 0) {
                // emit event
                emit CollectiveTakeBackDeposit(
                    msg.sender,
                    uint8(CurrencyType(j)),
                    remainingDeposit[j]
                );

                // send deposit
                pool.transferAsset(
                    msg.sender,
                    CurrencyType(j),
                    remainingDeposit[j]
                );
            }
        }
    }

    /**
     * @dev return total of locked deposit and total of withdrawable deposit
     * called by funder for refund deposit on provide cover request
     */
    function getDepositOfProvideCover(address funderAddr)
        external
        view
        returns (
            uint256 totalWithdrawInUSD,
            uint256 totalLockDepositInUSD,
            uint256[] memory withdrawableDeposit,
            uint8 usdDecimals
        )
    {
        withdrawableDeposit = new uint256[](uint8(CurrencyType.END_ENUM));
        uint256[] memory lockDeposit = new uint256[](
            uint8(CurrencyType.END_ENUM)
        );
        uint256[] memory listCoverIds = coverData.getFunderToCovers(funderAddr);

        for (uint256 i = 0; i < listCoverIds.length; i++) {
            uint256 coverId = listCoverIds[i];
            InsuranceCover memory cover = coverData.getCoverById(coverId);
            if (
                cover.listingType == ListingType.REQUEST &&
                !listingData.isDepositTakenBack(coverId)
            ) {
                // get Cover Request data
                CoverRequest memory coverRequest = listingData
                    .getCoverRequestById(cover.requestId);
                // get expired time of cover
                uint256 coverEndAt = coverGateway.getEndAt(coverId);
                // Cover Request is fail when request not reaching target & already passing listing expired time
                bool isCoverRequestFail = !listingData.isRequestReachTarget(
                    cover.requestId
                ) && (block.timestamp > coverRequest.expiredAt);
                // Remaining deposit
                uint256 remainingDeposit = cover.insuredSum -
                    claimData.coverToPayout(coverId);

                if (
                    (coverGateway.isRequestCoverSucceed(cover.requestId) &&
                        coverEndAt < block.timestamp &&
                        !claimHelper.isPendingClaimExistOnCover(coverId) &&
                        (remainingDeposit > 0)) || isCoverRequestFail
                ) {
                    // Get withdrawable deposit
                    withdrawableDeposit[
                        uint8(coverRequest.insuredSumCurrency)
                    ] += remainingDeposit;
                } else {
                    // Get Lock Deposit deduct by by payout
                    lockDeposit[
                        uint8(coverRequest.insuredSumCurrency)
                    ] += remainingDeposit;
                }
            }
        }

        (totalWithdrawInUSD, totalLockDepositInUSD, usdDecimals) = claimHelper
            .convertPrice(withdrawableDeposit, lockDeposit);

        return (
            totalWithdrawInUSD,
            totalLockDepositInUSD,
            withdrawableDeposit,
            usdDecimals
        );
    }

    /**
     * @dev function called by FUNDER which PROVIDE FUND for COVER REQUEST
     * function will send back deposit to funder
     */
    function collectiveRefundDepositOfProvideRequest() external {
        require(
            !claimHelper.isFunderHasPendingClaims(
                ListingType.REQUEST,
                msg.sender
            ),
            "ERR_CLG_21"
        );

        // Initialize variabel for calculate deposit
        uint256[] memory deposit = new uint256[](uint8(CurrencyType.END_ENUM));

        // Get list cover id of which funded by funder
        uint256[] memory listCoverIds = coverData.getFunderToCovers(msg.sender);

        for (uint256 i = 0; i < listCoverIds.length; i++) {
            InsuranceCover memory cover = coverData.getCoverById(
                listCoverIds[i]
            );
            if (cover.listingType == ListingType.REQUEST) {
                // get Cover Request data
                CoverRequest memory coverRequest = listingData
                    .getCoverRequestById(cover.requestId);

                // get expired time of cover
                uint256 coverEndAt = coverGateway.getEndAt(listCoverIds[i]);
                // Cover Request is fail when request not reaching target & already passing listing expired time
                bool isCoverRequestFail = !listingData.isRequestReachTarget(
                    cover.requestId
                ) && (block.timestamp > coverRequest.expiredAt);

                // Calculate payout for cover & Remaining deposit
                // Payout for the cover = Payout for request * cover.insuredSum / Insured Sum Taken
                uint256 coverToPayout = (claimData.requestIdToPayout(
                    cover.requestId
                ) * cover.insuredSum) /
                    listingData.requestIdToInsuredSumTaken(cover.requestId);
                // Remaining deposit = Insured Sum - payout for the cover
                uint256 remainingDeposit = cover.insuredSum - coverToPayout;

                // caller must be a funder of the cover
                // deposit not taken back yet
                // there is NO pending claims on the cover
                // ((succedd cover request that passing expired cover time and doesnlt have valid claim) or fail request)
                if (
                    coverData.isFunderOfCover(msg.sender, listCoverIds[i]) &&
                    !listingData.isDepositTakenBack(listCoverIds[i]) &&
                    (claimData.coverToPendingClaims(listCoverIds[i]) == 0) &&
                    ((coverGateway.isRequestCoverSucceed(cover.requestId) &&
                        coverEndAt < block.timestamp &&
                        (remainingDeposit > 0)) || isCoverRequestFail)
                ) {
                    // increase total deposit based on currency type (premium currency)
                    deposit[
                        uint8(coverRequest.insuredSumCurrency)
                    ] += remainingDeposit;

                    // mark cover as desposit already taken back
                    listingData.setIsDepositTakenBack(listCoverIds[i]);

                    // Set Payout for cover
                    claimData.setCoverToPayout(listCoverIds[i], coverToPayout);
                }
            }
        }

        for (uint8 j = 0; j < uint8(CurrencyType.END_ENUM); j++) {
            if (deposit[j] > 0) {
                // emit event
                emit CollectiveRefundDeposit(
                    msg.sender,
                    uint8(CurrencyType(j)),
                    deposit[j]
                );
                // send deposit
                pool.transferAsset(msg.sender, CurrencyType(j), deposit[j]);
            }
        }
    }

    /**
     * @dev Called by insurance holder for check claim status over cover, that cover come from take request
     */
    function checkPayout(uint256 collectiveClaimId) external {
        uint256 requestId = claimData.collectiveClaimToRequest(
            collectiveClaimId
        );
        // make sure there is no valid claim
        require(!claimData.isValidClaimExistOnRequest(requestId), "ERR_CLG_4");

        CollectiveClaim memory collectiveClaim = claimData
            .getCollectiveClaimById(collectiveClaimId);
        // Price feed aggregator
        address priceFeedAddr = platformData.getOraclePriceFeedAddress(
            listingData.getCoverRequestById(requestId).coinId
        );
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddr);
        // Call aggregator
        (, , uint256 startedAt, , ) = priceFeed.getRoundData(
            collectiveClaim.roundId
        );
        require(
            ((startedAt + cg.monitoringPeriod()) + 1 hours) < block.timestamp,
            "ERR_CLG_8"
        );
        // Check status of collective claim , must still on monitoring
        require(collectiveClaim.state == ClaimState.MONITORING, "ERR_CLG_26");
        require(
            block.timestamp <=
                (startedAt + cg.monitoringPeriod() + cg.maxPayoutPeriod()),
            "ERR_CLG_9"
        );

        _checkValidityAndPayout(collectiveClaimId, priceFeedAddr);
    }
}
