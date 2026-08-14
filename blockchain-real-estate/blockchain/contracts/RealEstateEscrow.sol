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
 * Ugovor provjerava jesu li zadovoljeni uvjeti kupoprodaje,
 * zaprima sredstva kupca i automatski izvršava prijenos
 * digitalnog vlasništva i sredstava prodavatelju.
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
     * @notice Rezultat automatske provjere svih uvjeta
     * potrebnih za izvršenje kupoprodaje.
     *
     * Struktura se može dohvatiti s frontenda prije pokušaja
     * kupnje kako bi korisnik jasno vidio koji su uvjeti
     * zadovoljeni, a koji nisu.
     */
    struct PurchaseConditions {
        bool saleExists;
        bool saleActive;
        bool documentsValid;
        bool sellerIsOwner;
        bool buyerIsNotSeller;
        bool buyerHasSufficientBalance;
        bool buyerHasSufficientAllowance;
        bool readyForPurchase;
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
     * @notice Kreira novu ponudu za prodaju nekretnine.
     *
     * Prodaja se može kreirati samo ako:
     * - cijena je veća od nule
     * - dokumentacija nekretnine je valjana
     * - pozivatelj je trenutačni digitalni vlasnik
     * - nekretnina nema drugu aktivnu prodaju
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
            "Dokumentacija nekretnine nije valjana"
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
     * @notice Provjerava sve uvjete potrebne za kupnju nekretnine.
     *
     * Funkcija ne mijenja stanje blockchaina.
     *
     * Frontend je može koristiti za prikaz jasne kontrolne liste
     * uvjeta prije nego što kupac pokuša izvršiti kupoprodaju.
     *
     * @param saleId ID prodaje.
     * @param buyer Adresa potencijalnog kupca.
     *
     * @return conditions Rezultat provjere svih uvjeta.
     */
    function getPurchaseConditions(
        uint256 saleId,
        address buyer
    ) external view returns (PurchaseConditions memory conditions) {
        return _getPurchaseConditions(saleId, buyer);
    }

    /**
     * @notice Kupac polaže puni iznos kupoprodajne cijene.
     *
     * Prije prijenosa sredstava pametni ugovor automatski
     * provjerava sve uvjete potrebne za izvršenje kupoprodaje.
     *
     * Kada su svi uvjeti zadovoljeni, sredstva se prebacuju
     * u escrow te se kupoprodaja automatski završava.
     *
     * @param saleId Jedinstveni identifikator kupoprodaje.
     */
    function fundSale(uint256 saleId) external nonReentrant {
        PurchaseConditions memory conditions = _getPurchaseConditions(
            saleId,
            msg.sender
        );

        /**
         * Svaki uvjet ima vlastitu poruku greške kako bi bilo
         * potpuno jasno zašto transakcija nije dopuštena.
         */

        require(conditions.saleExists, "Prodaja ne postoji");

        require(conditions.saleActive, "Prodaja nije dostupna za uplatu");

        require(conditions.buyerIsNotSeller, "Prodavatelj ne moze biti kupac");

        require(
            conditions.documentsValid,
            "Dokumentacija nekretnine nije valjana"
        );

        require(
            conditions.sellerIsOwner,
            "Prodavatelj vise nije vlasnik nekretnine"
        );

        require(
            conditions.buyerHasSufficientBalance,
            "Kupac nema dovoljno sredstava"
        );

        require(
            conditions.buyerHasSufficientAllowance,
            "Kupac nije odobrio dovoljan iznos sredstava"
        );

        /**
         * Ako smo došli do ove točke,
         * svi uvjeti moraju biti zadovoljeni.
         */
        require(
            conditions.readyForPurchase,
            "Uvjeti za kupoprodaju nisu zadovoljeni"
        );

        Sale storage sale = sales[saleId];

        /**
         * Tek nakon potvrde svih uvjeta sredstva
         * se prenose s kupca u escrow.
         */
        paymentToken.safeTransferFrom(msg.sender, address(this), sale.price);

        sale.buyer = msg.sender;
        sale.status = SaleStatus.Funded;

        emit SaleFunded(saleId, msg.sender, sale.price);

        /**
         * Nema ručnog posrednika koji završava kupoprodaju.
         *
         * Smart contract odmah i automatski izvršava
         * završetak kupoprodaje.
         */
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
     */
    function getSaleCount() external view returns (uint256) {
        return nextSaleId - 1;
    }

    /**
     * @notice Dohvaća podatke kupoprodajne transakcije.
     */
    function getSale(uint256 saleId) external view returns (Sale memory) {
        require(sales[saleId].exists, "Prodaja ne postoji");

        return sales[saleId];
    }

    /**
     * @dev Interna funkcija koja centralno provjerava
     * sve uvjete potrebne za izvršenje kupoprodaje.
     *
     * Ova funkcija predstavlja jedinstveni izvor istine
     * za provjeru preduvjeta kupoprodaje.
     */
    function _getPurchaseConditions(
        uint256 saleId,
        address buyer
    ) private view returns (PurchaseConditions memory conditions) {
        Sale storage sale = sales[saleId];

        /**
         * 1. Prodaja mora postojati.
         */
        conditions.saleExists = sale.exists;

        /**
         * Ako prodaja ne postoji, ostali uvjeti nemaju smisla
         * i vraća se struktura s false vrijednostima.
         */
        if (!conditions.saleExists) {
            return conditions;
        }

        /**
         * 2. Prodaja mora biti u statusu Created
         * i mora biti evidentirana kao aktivna prodaja
         * za navedenu nekretninu.
         */
        conditions.saleActive =
            sale.status == SaleStatus.Created &&
            activeSaleByProperty[sale.propertyId] == saleId;

        /**
         * 3. Sva obvezna dokumentacija nekretnine
         * mora biti predana i potvrđena.
         */
        conditions.documentsValid = propertyRegistry.isPropertyVerified(
            sale.propertyId
        );

        /**
         * 4. Prodavatelj mora i dalje biti trenutačni
         * digitalni vlasnik nekretnine.
         */
        address currentOwner = propertyRegistry.getDigitalOwner(
            sale.propertyId
        );

        conditions.sellerIsOwner = currentOwner == sale.seller;

        /**
         * 5. Kupac ne smije biti prodavatelj.
         */
        conditions.buyerIsNotSeller =
            buyer != address(0) &&
            buyer != sale.seller;

        /**
         * 6. Kupac mora raspolagati dovoljnim
         * brojem mEUR tokena.
         */
        uint256 buyerBalance = paymentToken.balanceOf(buyer);

        conditions.buyerHasSufficientBalance = buyerBalance >= sale.price;

        /**
         * 7. Kupac mora escrow ugovoru odobriti
         * dovoljan iznos tokena.
         */
        uint256 buyerAllowance = paymentToken.allowance(buyer, address(this));

        conditions.buyerHasSufficientAllowance = buyerAllowance >= sale.price;

        /**
         * Konačna odluka.
         *
         * Kupoprodaja je spremna za izvršenje
         * samo ako su SVI uvjeti zadovoljeni.
         */
        conditions.readyForPurchase =
            conditions.saleExists &&
            conditions.saleActive &&
            conditions.documentsValid &&
            conditions.sellerIsOwner &&
            conditions.buyerIsNotSeller &&
            conditions.buyerHasSufficientBalance &&
            conditions.buyerHasSufficientAllowance;

        return conditions;
    }

    /**
     * @dev Automatski završava financiranu kupoprodaju.
     *
     * Funkcija se poziva isključivo iz fundSale nakon što su
     * svi uvjeti provjereni i puni iznos uspješno prenesen u escrow.
     *
     * Ako prijenos vlasništva ili isplata ne uspiju,
     * revertira se cijela blockchain transakcija.
     */
    function _completeSale(uint256 saleId) private {
        Sale storage sale = sales[saleId];

        require(
            sale.status == SaleStatus.Funded,
            "Prodaja nije spremna za zavrsetak"
        );

        sale.status = SaleStatus.Completed;

        activeSaleByProperty[sale.propertyId] = 0;

        /**
         * Automatski digitalni prijenos vlasništva.
         */
        propertyRegistry.transferPropertyOwnership(sale.propertyId, sale.buyer);

        /**
         * Automatska isplata punog iznosa prodavatelju.
         */
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
