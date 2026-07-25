// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IPropertyRegistry} from "./interfaces/IPropertyRegistry.sol";

/**
 * @title RealEstateEscrow
 * @notice Escrow pametni ugovor za simuliranu kupoprodaju nekretnina.
 *
 * Ugovor privremeno zaprima sredstva kupca te ih prenosi
 * prodavatelju nakon ispunjavanja svih uvjeta kupoprodaje.
 *
 * Digitalni prijenos vlasništva ne predstavlja stvarni
 * zemljišnoknjižni upis u Republici Hrvatskoj.
 */
contract RealEstateEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /**
     * @notice Status kupoprodajne transakcije.
     */
    enum SaleStatus {
        Created,
        Funded,
        Completed,
        Cancelled
    }

    /**
     * @notice Podaci o jednoj kupoprodajnoj transakciji.
     */
    struct Sale {
        uint256 id;
        uint256 propertyId;
        address seller;
        address buyer;
        uint256 price;
        SaleStatus status;
        bool exists;
    }

    /**
     * @notice PropertyRegistry pametni ugovor.
     */
    IPropertyRegistry public immutable propertyRegistry;

    /**
     * @notice ERC-20 token koji se koristi za simulirano plaćanje.
     */
    IERC20 public immutable paymentToken;

    /**
     * @notice ID sljedeće kupoprodajne transakcije.
     */
    uint256 private nextSaleId = 1;

    /**
     * @notice Kupoprodajne transakcije spremljene prema njihovu ID-u.
     */
    mapping(uint256 => Sale) private sales;

    /**
     * @notice Aktivna kupoprodaja za pojedinu nekretninu.
     *
     * Vrijednost 0 znači da nekretnina trenutačno nema aktivnu prodaju.
     */
    mapping(uint256 => uint256) private activeSaleByProperty;

    /**
     * @notice Događaj koji se zapisuje kada vlasnik kreira prodaju.
     */
    event SaleCreated(
        uint256 indexed saleId,
        uint256 indexed propertyId,
        address indexed seller,
        uint256 price
    );

    /**
     * @notice Događaj koji se zapisuje nakon polaganja sredstava.
     */
    event SaleFunded(
        uint256 indexed saleId,
        address indexed buyer,
        uint256 amount
    );

    /**
     * @notice Događaj koji se zapisuje nakon završetka kupoprodaje.
     */
    event SaleCompleted(
        uint256 indexed saleId,
        uint256 indexed propertyId,
        address indexed buyer,
        address seller,
        uint256 amount
    );

    /**
     * @notice Događaj koji se zapisuje nakon otkazivanja prodaje.
     */
    event SaleCancelled(
        uint256 indexed saleId,
        uint256 indexed propertyId,
        address indexed seller
    );

    /**
     * @param propertyRegistryAddress Adresa PropertyRegistry ugovora.
     * @param paymentTokenAddress Adresa MockEUR tokena.
     */
    constructor(address propertyRegistryAddress, address paymentTokenAddress) {
        require(
            propertyRegistryAddress != address(0),
            "Adresa registra nije valjana"
        );

        require(
            paymentTokenAddress != address(0),
            "Adresa tokena nije valjana"
        );

        propertyRegistry = IPropertyRegistry(propertyRegistryAddress);

        paymentToken = IERC20(paymentTokenAddress);
    }

    /**
     * @notice Kreira novu ponudu za prodaju potvrđene nekretnine.
     *
     * Ponudu može kreirati samo trenutačni digitalni vlasnik nekretnine.
     *
     * @param propertyId Jedinstveni identifikator nekretnine.
     * @param price Prodajna cijena u najmanjim jedinicama mEUR tokena.
     *
     * @return saleId Jedinstveni identifikator kupoprodaje.
     */
    function createSale(
        uint256 propertyId,
        uint256 price
    ) external returns (uint256 saleId) {
        require(price > 0, "Cijena mora biti veca od nule");

        require(
            propertyRegistry.isPropertyVerified(propertyId),
            "Nekretnina nije potvrdena"
        );

        address currentOwner = propertyRegistry.getDigitalOwner(propertyId);

        require(
            currentOwner == msg.sender,
            "Samo vlasnik moze kreirati prodaju"
        );

        require(
            activeSaleByProperty[propertyId] == 0,
            "Nekretnina vec ima aktivnu prodaju"
        );

        saleId = nextSaleId;

        sales[saleId] = Sale({
            id: saleId,
            propertyId: propertyId,
            seller: msg.sender,
            buyer: address(0),
            price: price,
            status: SaleStatus.Created,
            exists: true
        });

        activeSaleByProperty[propertyId] = saleId;
        nextSaleId++;

        emit SaleCreated(saleId, propertyId, msg.sender, price);

        return saleId;
    }

    /**
     * @notice Kupac polaže puni iznos kupoprodajne cijene.
     *
     * Kupac prije poziva mora funkcijom approve odobriti escrow
     * ugovoru korištenje dovoljne količine mEUR tokena.
     *
     * Nakon uspješnog polaganja sredstava kupoprodaja se
     * automatski završava.
     *
     * @param saleId Jedinstveni identifikator kupoprodaje.
     */
    function fundSale(uint256 saleId) external nonReentrant {
        Sale storage sale = sales[saleId];

        require(sale.exists, "Prodaja ne postoji");

        require(
            sale.status == SaleStatus.Created,
            "Prodaja nije dostupna za uplatu"
        );

        require(msg.sender != sale.seller, "Prodavatelj ne moze biti kupac");

        paymentToken.safeTransferFrom(msg.sender, address(this), sale.price);

        sale.buyer = msg.sender;
        sale.status = SaleStatus.Funded;

        emit SaleFunded(saleId, msg.sender, sale.price);

        _completeSale(saleId);
    }

    /**
     * @notice Otkazuje prodaju prije polaganja sredstava.
     *
     * Prodaju može otkazati samo prodavatelj dok je
     * transakcija u statusu Created.
     *
     * @param saleId Jedinstveni identifikator kupoprodaje.
     */
    function cancelSale(uint256 saleId) external {
        Sale storage sale = sales[saleId];

        require(sale.exists, "Prodaja ne postoji");

        require(
            sale.seller == msg.sender,
            "Samo prodavatelj moze otkazati prodaju"
        );

        require(
            sale.status == SaleStatus.Created,
            "Prodaju vise nije moguce otkazati"
        );

        sale.status = SaleStatus.Cancelled;
        activeSaleByProperty[sale.propertyId] = 0;

        emit SaleCancelled(saleId, sale.propertyId, msg.sender);
    }

    /**
     * @notice Vraća ukupan broj kreiranih kupoprodajnih transakcija.
     *
     * @return Ukupan broj prodaja.
     */
    function getSaleCount() external view returns (uint256) {
        return nextSaleId - 1;
    }

    /**
     * @notice Dohvaća podatke kupoprodajne transakcije.
     *
     * @param saleId Jedinstveni identifikator kupoprodaje.
     *
     * @return Podaci o kupoprodaji.
     */
    function getSale(uint256 saleId) external view returns (Sale memory) {
        require(sales[saleId].exists, "Prodaja ne postoji");

        return sales[saleId];
    }

    /**
     * @dev Automatski završava financiranu kupoprodaju.
     *
     * Funkcija se poziva unutar fundSale nakon što kupac
     * uspješno položi puni iznos kupoprodajne cijene.
     *
     * Ako prijenos vlasništva ili isplata ne uspiju,
     * poništava se cijela transakcija.
     */
    function _completeSale(uint256 saleId) private {
        Sale storage sale = sales[saleId];

        require(
            sale.status == SaleStatus.Funded,
            "Prodaja nije spremna za zavrsetak"
        );

        sale.status = SaleStatus.Completed;
        activeSaleByProperty[sale.propertyId] = 0;

        propertyRegistry.transferPropertyOwnership(sale.propertyId, sale.buyer);

        paymentToken.safeTransfer(sale.seller, sale.price);

        emit SaleCompleted(
            saleId,
            sale.propertyId,
            sale.buyer,
            sale.seller,
            sale.price
        );
    }
}
