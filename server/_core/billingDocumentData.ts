/**
 * Turns a verified billing period into the exact data printed on the document set.
 *
 * One pure builder produces the data for the invoice, the act and the registry, so
 * the three documents can never disagree about the client, the period, the number,
 * the date or the total. Rendering (PDF/XLSX) is a separate, dumb step.
 */
import type { Request as DeliveryRequest } from "../../drizzle/schema";
import {
  amountInWordsRu,
  formatDateRu,
  formatMoney,
  periodText,
  serviceNameForPeriod,
  sumMoney,
  vatBreakdown,
  type VatBreakdown,
} from "../../shared/billing-format";
import { clientDocumentAddress, clientDocumentName, clientPostalAddress, type ClientRequisites } from "./billingReview";
import type { DocumentSettings } from "./documentSettings";
import type { BillingRequestRow } from "./billingReview";

export interface DocumentLine {
  /** Running number in the table. */
  position: number;
  name: string;
  unit: string;
  quantity: number;
  price: number;
  amount: number;
}

export interface RegistryRow {
  position: number;
  /** ISO date (YYYY-MM-DD) for machine use. */
  dateIso: string;
  /** DD.MM.YYYY for printing. */
  dateText: string;
  requestType: string;
  requestTypeLabel: string;
  from: string;
  to: string;
  placesCount: number | null;
  amount: number;
  comment: string;
}

export interface DocumentSetData {
  number: string;
  /** ISO date shared by the invoice, the act and the registry. */
  documentDateIso: string;
  /** DD.MM.YYYY for printing. */
  documentDateText: string;
  periodFrom: string;
  periodTo: string;
  periodText: string;
  serviceName: string;

  seller: {
    name: string;
    shortName: string | null;
    inn: string | null;
    kpp: string | null;
    ogrn: string | null;
    address: string;
    postalAddress: string | null;
    phone: string | null;
    email: string | null;
    bankName: string;
    bankBik: string;
    bankAccount: string;
    bankCorrespondentAccount: string;
    directorName: string;
    directorPosition: string;
    accountantName: string | null;
    signatureFile: string | null;
    stampFile: string | null;
    vatText: string;
    vatExemptionBasis: string | null;
  };

  buyer: {
    name: string;
    inn: string | null;
    kpp: string | null;
    /** Printed address (postal preferred, else legal, else working). */
    address: string;
    /** Legal address, when it differs from the printed one. */
    legalAddress: string | null;
    /** Postal address as stored on the client card. */
    postalAddress: string | null;
    /** OGRN / OGRNIP; optional — the template must work without it. */
    ogrn: string | null;
    phone: string | null;
  };

  lines: DocumentLine[];
  registry: RegistryRow[];

  requestsCount: number;
  totalPlaces: number;
  totalAmount: number;
  totalAmountText: string;
  amountInWords: string;
  vat: VatBreakdown;
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  delivery: "Доставка",
  movement: "Перемещение",
  nuts: "Орехи",
  courier_call: "Вызов курьера",
  pickup_from_tc: "Забор из ТК",
  simple: "Простая заявка",
};

export function requestTypeLabel(type: string | null | undefined): string {
  return REQUEST_TYPE_LABELS[String(type ?? "")] ?? String(type ?? "");
}

/** Where the courier picks up, using the same fields the courier task shows. */
export function requestFromLabel(request: DeliveryRequest): string {
  return request.senderCompany || request.senderName || request.tcName || request.senderAddress || "—";
}

/** Where the request goes. */
export function requestToLabel(request: DeliveryRequest): string {
  return request.deliveryAddress || request.recipientAddress || request.recipientCompany || request.recipientName || "—";
}

export interface BuildDocumentSetInput {
  number: string;
  documentDateIso: string;
  periodFrom: string;
  periodTo: string;
  settings: DocumentSettings;
  client: ClientRequisites;
  /** Only verified completed requests; callers must pass billableRows(overview). */
  rows: BillingRequestRow[];
  /** Optional per-request comments override (defaults to request.comments). */
  comments?: Map<number, string>;
}

/**
 * Build the whole printed dataset. The service table holds one aggregated line for
 * the period (the usual wording "Курьерские услуги за <месяц> <год> г."), while the
 * registry lists every request that makes up that line.
 */
export function buildDocumentSetData(input: BuildDocumentSetInput): DocumentSetData {
  const { settings, client, rows } = input;

  const registry: RegistryRow[] = rows.map((row, index) => {
    const request = row.request;
    const comment = input.comments?.get(Number(request.id)) ?? (request.comments ?? "").trim();
    const completedIso = request.completedAt ? new Date(request.completedAt).toISOString().slice(0, 10) : "";
    const createdIso = request.createdAt ? new Date(request.createdAt).toISOString().slice(0, 10) : "";
    const dateIso = completedIso || createdIso;
    return {
      position: index + 1,
      dateIso,
      dateText: formatDateRu(dateIso),
      requestType: String(request.requestType ?? ""),
      requestTypeLabel: requestTypeLabel(request.requestType),
      from: requestFromLabel(request),
      to: requestToLabel(request),
      placesCount: request.placesCount ?? null,
      amount: Number(row.amount ?? 0),
      comment,
    };
  });

  const totalAmount = sumMoney(registry.map((row) => row.amount));
  const totalPlaces = registry.reduce((sum, row) => sum + Number(row.placesCount ?? 0), 0);
  const serviceName = serviceNameForPeriod(input.periodTo);
  const vat = vatBreakdown(totalAmount, settings.vatMode, settings.vatRate);

  const lines: DocumentLine[] = registry.length === 0
    ? []
    : [{
        position: 1,
        name: serviceName,
        unit: "усл.",
        quantity: 1,
        price: totalAmount,
        amount: totalAmount,
      }];

  return {
    number: input.number,
    documentDateIso: input.documentDateIso,
    documentDateText: formatDateRu(input.documentDateIso),
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    periodText: periodText(input.periodFrom, input.periodTo),
    serviceName,
    seller: {
      name: settings.executorName ?? "",
      shortName: settings.executorShortName,
      inn: settings.executorInn,
      kpp: settings.executorKpp,
      ogrn: settings.executorOgrn ?? settings.executorOgrnip,
      address: settings.executorAddress ?? "",
      postalAddress: settings.executorPostalAddress,
      phone: settings.executorPhone,
      email: settings.executorEmail,
      bankName: settings.bankName ?? "",
      bankBik: settings.bankBik ?? "",
      bankAccount: settings.bankAccount ?? "",
      bankCorrespondentAccount: settings.bankCorrespondentAccount ?? "",
      directorName: settings.directorName ?? "",
      directorPosition: settings.directorPosition ?? "Директор",
      accountantName: settings.accountantName,
      signatureFile: settings.signatureFile,
      stampFile: settings.stampFile,
      vatText: settings.vatText || vat.rateText,
      vatExemptionBasis: settings.vatExemptionBasis,
    },
    buyer: {
      name: clientDocumentName(client),
      inn: client.inn,
      kpp: client.kpp,
      address: clientDocumentAddress(client),
      legalAddress: client.legalAddress,
      postalAddress: clientPostalAddress(client),
      ogrn: client.ogrn,
      phone: client.phone,
    },
    lines,
    registry,
    requestsCount: registry.length,
    totalPlaces,
    totalAmount,
    totalAmountText: formatMoney(totalAmount),
    amountInWords: amountInWordsRu(totalAmount),
    vat,
  };
}

/**
 * Sanity check used by the API before anything is written: the three documents are
 * generated from one dataset, so the totals are equal by construction — this asserts
 * it explicitly and guards against a future change breaking that invariant.
 */
export function documentSetTotals(data: DocumentSetData): {
  invoiceTotal: number;
  actTotal: number;
  registryTotal: number;
  linesTotal: number;
} {
  return {
    invoiceTotal: data.totalAmount,
    actTotal: data.totalAmount,
    registryTotal: sumMoney(data.registry.map((row) => row.amount)),
    linesTotal: sumMoney(data.lines.map((line) => line.amount)),
  };
}
