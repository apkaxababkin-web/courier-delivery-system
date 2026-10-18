/**
 * Schema parity with production PostgreSQL — DEFINITION level (stage B).
 *
 * Reference snapshot: production catalogue dump of **2026-10-16**
 * (65 tables / 816 columns / 186 constraints / 204 indexes). Only the 46 tables
 * declared in `drizzle/schema.ts` are covered here; the remaining 19 are stage C.
 *
 * The test compares drizzle's own runtime metadata (the very model `drizzle-kit`
 * diffs against) with the snapshot below — names AND definitions: index uniqueness,
 * key columns and expressions, partial predicates, foreign-key columns/targets and
 * ON DELETE / ON UPDATE actions, CHECK expressions, column nullability.
 * No database connection is made and no file outside the repository is read.
 */
import { describe, expect, it } from "vitest";
import path from "node:path";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import * as schema from "../drizzle/schema";

const SNAPSHOT_DATE = "2026-10-16";

type Expected = {
  columns: Record<string, boolean>;
  indexes: { name: string; unique: boolean; keys: string[]; where: string }[];
  uniques: { name: string; columns: string[] }[];
  foreignKeys: { name: string; columns: string[]; refTable: string; refColumns: string[];
                 onDelete: string; onUpdate: string }[];
  checks: { name: string; expr: string }[];
};
const SNAPSHOT: Record<string, Expected> = {
 "addressOrgContacts": {
  "columns": {
   "id": true,
   "organizationId": true,
   "locationId": false,
   "name": false,
   "position": false,
   "phone": false,
   "phoneNormalized": false,
   "email": false,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "addressOrgContacts_locationId_idx",
    "unique": false,
    "keys": [
     "locationid"
    ],
    "where": ""
   },
   {
    "name": "addressOrgContacts_name_idx",
    "unique": false,
    "keys": [
     "name"
    ],
    "where": ""
   },
   {
    "name": "addressOrgContacts_organizationId_idx",
    "unique": false,
    "keys": [
     "organizationid"
    ],
    "where": ""
   },
   {
    "name": "addressOrgContacts_phoneNormalized_idx",
    "unique": false,
    "keys": [
     "phonenormalized"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "addressOrgContacts_locationId_fkey",
    "columns": [
     "locationId"
    ],
    "refTable": "addressOrgLocations",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   },
   {
    "name": "addressOrgContacts_organizationId_fkey",
    "columns": [
     "organizationId"
    ],
    "refTable": "addressOrganizations",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "addressOrgLocations": {
  "columns": {
   "id": true,
   "organizationId": true,
   "label": false,
   "city": false,
   "address": true,
   "postalCode": false,
   "normalizedAddress": true,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "addressOrgLocations_normalizedAddress_idx",
    "unique": false,
    "keys": [
     "normalizedaddress"
    ],
    "where": ""
   },
   {
    "name": "addressOrgLocations_organizationId_idx",
    "unique": false,
    "keys": [
     "organizationid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "addressOrgLocations_organizationId_fkey",
    "columns": [
     "organizationId"
    ],
    "refTable": "addressOrganizations",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "addressOrganizations": {
  "columns": {
   "id": true,
   "name": true,
   "normalizedName": true,
   "comment": false,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "addressOrganizations_name_idx",
    "unique": false,
    "keys": [
     "name"
    ],
    "where": ""
   },
   {
    "name": "addressOrganizations_normalizedName_idx",
    "unique": false,
    "keys": [
     "normalizedname"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "billingDocumentEvents": {
  "columns": {
   "id": true,
   "billingDocumentId": true,
   "kind": true,
   "managerId": false,
   "managerName": false,
   "note": false,
   "details": false,
   "createdAt": true
  },
  "indexes": [
   {
    "name": "billingDocumentEvents_document_idx",
    "unique": false,
    "keys": [
     "billingdocumentid",
     "createdat"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "billingDocumentEvents_document_fk",
    "columns": [
     "billingDocumentId"
    ],
    "refTable": "billingDocuments",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "billingDocumentEvents_manager_fk",
    "columns": [
     "managerId"
    ],
    "refTable": "managers",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "billingDocumentEvents_kind_valid",
    "expr": "(kind)::text = any ((array['issued'::character varying,'reissued'::character varying,'voided'::character varying,'requests_released'::character varying,'replaced_by'::character varying,'payment_set'::character varying,'payment_cleared'::character varying,'rolled_back'::character varying])::text[])"
   }
  ]
 },
 "billingDocumentFiles": {
  "columns": {
   "id": true,
   "billingDocumentId": true,
   "kind": true,
   "originalName": true,
   "storedName": true,
   "fileUrl": true,
   "mimeType": true,
   "sizeBytes": true,
   "uploadedByManagerId": false,
   "createdAt": true
  },
  "indexes": [
   {
    "name": "billingDocumentFiles_document_idx",
    "unique": false,
    "keys": [
     "billingdocumentid",
     "kind"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "billingDocumentFiles_document_fk",
    "columns": [
     "billingDocumentId"
    ],
    "refTable": "billingDocuments",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "billingDocumentFiles_uploadedByManager_fk",
    "columns": [
     "uploadedByManagerId"
    ],
    "refTable": "managers",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "billingDocumentFiles_kind_valid",
    "expr": "(kind)::text = 'payment_proof'::text"
   },
   {
    "name": "billingDocumentFiles_size_nonnegative",
    "expr": "sizebytes >= 0"
   }
  ]
 },
 "billingDocumentNumberSequences": {
  "columns": {
   "year": true,
   "nextNumber": true,
   "initialized": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": [
   {
    "name": "billingDocumentNumberSequences_next_positive",
    "expr": "nextnumber > 0"
   },
   {
    "name": "billingDocumentNumberSequences_year_valid",
    "expr": "(year >= 2000) and (year <= 9999)"
   }
  ]
 },
 "billingDocumentRequests": {
  "columns": {
   "id": true,
   "billingDocumentId": true,
   "requestId": true,
   "amount": true,
   "createdAt": true,
   "releasedAt": false,
   "releasedByManagerId": false,
   "active": true,
   "releaseNote": false
  },
  "indexes": [
   {
    "name": "billingDocumentRequests_active_document_idx",
    "unique": false,
    "keys": [
     "billingdocumentid"
    ],
    "where": "active"
   },
   {
    "name": "billingDocumentRequests_active_request_key",
    "unique": true,
    "keys": [
     "requestid"
    ],
    "where": "active"
   },
   {
    "name": "billingDocumentRequests_document_idx",
    "unique": false,
    "keys": [
     "billingdocumentid"
    ],
    "where": ""
   },
   {
    "name": "billingDocumentRequests_request_idx",
    "unique": false,
    "keys": [
     "requestid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "billingDocumentRequests_document_fk",
    "columns": [
     "billingDocumentId"
    ],
    "refTable": "billingDocuments",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "billingDocumentRequests_releasedByManager_fk",
    "columns": [
     "releasedByManagerId"
    ],
    "refTable": "managers",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   },
   {
    "name": "billingDocumentRequests_request_fk",
    "columns": [
     "requestId"
    ],
    "refTable": "requests",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "billingDocumentRequests_amount_nonnegative",
    "expr": "amount >= (0)::numeric"
   }
  ]
 },
 "billingDocuments": {
  "columns": {
   "id": true,
   "number": true,
   "clientId": true,
   "documentDate": true,
   "periodFrom": true,
   "periodTo": true,
   "requestsCount": true,
   "totalAmount": true,
   "status": true,
   "serviceDescription": true,
   "clientNameSnapshot": true,
   "clientInnSnapshot": true,
   "clientKppSnapshot": false,
   "clientAddressSnapshot": true,
   "executorNameSnapshot": true,
   "executorInnSnapshot": true,
   "executorKppSnapshot": false,
   "executorAddressSnapshot": true,
   "executorPhoneSnapshot": false,
   "bankNameSnapshot": true,
   "bankBikSnapshot": true,
   "bankAccountSnapshot": true,
   "bankCorrespondentAccountSnapshot": true,
   "vatTextSnapshot": true,
   "invoiceFile": false,
   "actFile": false,
   "registryFile": false,
   "createdByManagerId": true,
   "createdAt": true,
   "paidAt": false,
   "paidByManagerId": false,
   "cancelledAt": false,
   "cancelledByManagerId": false,
   "updatedAt": true,
   "serviceNameSnapshot": false,
   "periodTextSnapshot": false,
   "vatModeSnapshot": false,
   "vatRateSnapshot": false,
   "vatAmountSnapshot": false,
   "clientOgrnSnapshot": false,
   "directorNameSnapshot": false,
   "directorPositionSnapshot": false,
   "accountantNameSnapshot": false,
   "generatedAt": false,
   "voidedAt": false,
   "voidedByManagerId": false,
   "voidReason": false,
   "paymentComment": false,
   "documentDateText": false,
   "clientPostalAddressSnapshot": false,
   "replacesDocumentId": false,
   "signatureFileSnapshot": false,
   "stampFileSnapshot": false,
   "stampEnabledSnapshot": false
  },
  "indexes": [
   {
    "name": "billingDocuments_client_idx",
    "unique": false,
    "keys": [
     "clientid"
    ],
    "where": ""
   },
   {
    "name": "billingDocuments_client_period_idx",
    "unique": false,
    "keys": [
     "clientid",
     "periodfrom",
     "periodto"
    ],
    "where": ""
   },
   {
    "name": "billingDocuments_period_idx",
    "unique": false,
    "keys": [
     "periodfrom",
     "periodto"
    ],
    "where": ""
   },
   {
    "name": "billingDocuments_status_idx",
    "unique": false,
    "keys": [
     "status"
    ],
    "where": ""
   },
   {
    "name": "billingDocuments_year_number_key",
    "unique": true,
    "keys": [
     "extract(year from documentdate)",
     "number"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "billingDocuments_cancelledByManager_fk",
    "columns": [
     "cancelledByManagerId"
    ],
    "refTable": "managers",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   },
   {
    "name": "billingDocuments_client_fk",
    "columns": [
     "clientId"
    ],
    "refTable": "clients",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "billingDocuments_createdByManager_fk",
    "columns": [
     "createdByManagerId"
    ],
    "refTable": "managers",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "billingDocuments_paidByManager_fk",
    "columns": [
     "paidByManagerId"
    ],
    "refTable": "managers",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   },
   {
    "name": "billingDocuments_replacesDocument_fk",
    "columns": [
     "replacesDocumentId"
    ],
    "refTable": "billingDocuments",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   },
   {
    "name": "billingDocuments_voidedByManager_fk",
    "columns": [
     "voidedByManagerId"
    ],
    "refTable": "managers",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "billingDocuments_period_valid",
    "expr": "periodfrom <= periodto"
   },
   {
    "name": "billingDocuments_requestsCount_positive",
    "expr": "requestscount > 0"
   },
   {
    "name": "billingDocuments_totalAmount_nonnegative",
    "expr": "totalamount >= (0)::numeric"
   }
  ]
 },
 "billingSettings": {
  "columns": {
   "id": true,
   "executorName": false,
   "executorInn": false,
   "executorKpp": false,
   "executorAddress": false,
   "executorPhone": false,
   "bankName": false,
   "bankBik": false,
   "bankAccount": false,
   "bankCorrespondentAccount": false,
   "vatText": true,
   "documentNumberPrefix": false,
   "nextDocumentNumber": true,
   "createdAt": true,
   "updatedAt": true,
   "executorShortName": false,
   "executorOgrn": false,
   "executorOgrnip": false,
   "executorPostalAddress": false,
   "executorEmail": false,
   "directorName": false,
   "directorPosition": false,
   "accountantName": false,
   "vatMode": true,
   "vatRate": true,
   "vatExemptionBasis": false,
   "signatureFile": false,
   "stampFile": false,
   "addStampToDocuments": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": [
   {
    "name": "billingSettings_nextDocumentNumber_positive",
    "expr": "nextdocumentnumber > 0"
   }
  ]
 },
 "chatMessageReactions": {
  "columns": {
   "id": true,
   "messageId": true,
   "authorType": true,
   "authorId": false,
   "authorName": true,
   "emoji": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "chatMessageReactions_messageId_idx",
    "unique": false,
    "keys": [
     "messageid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "chatMessages": {
  "columns": {
   "id": true,
   "authorType": true,
   "authorId": false,
   "authorName": true,
   "text": true,
   "deletedAt": false,
   "createdAt": true,
   "updatedAt": true,
   "replyToMessageId": false,
   "editedAt": false
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "chatReadStates": {
  "columns": {
   "id": true,
   "authorType": true,
   "authorId": false,
   "authorName": true,
   "lastReadMessageId": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "chatReadStates_author_idx",
    "unique": false,
    "keys": [
     "authortype",
     "authorid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "chatV2Attachments": {
  "columns": {
   "id": true,
   "messageId": true,
   "originalName": true,
   "storageKey": true,
   "fileUrl": true,
   "mimeType": false,
   "sizeBytes": true,
   "createdAt": true
  },
  "indexes": [
   {
    "name": "chatV2Attachments_message_idx",
    "unique": false,
    "keys": [
     "messageid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "chatV2Attachments_messageId_fkey",
    "columns": [
     "messageId"
    ],
    "refTable": "chatV2Messages",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "chatV2Attachments_sizeBytes_check",
    "expr": "sizebytes >= 0"
   }
  ]
 },
 "chatV2Conversations": {
  "columns": {
   "id": true,
   "kind": true,
   "title": true,
   "slug": false,
   "directKey": false,
   "createdByType": false,
   "createdById": false,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "chatV2Conversations_updatedAt_idx",
    "unique": false,
    "keys": [
     "updatedat"
    ],
    "where": ""
   }
  ],
  "uniques": [
   {
    "name": "chatV2Conversations_directKey_key",
    "columns": [
     "directKey"
    ]
   },
   {
    "name": "chatV2Conversations_slug_key",
    "columns": [
     "slug"
    ]
   }
  ],
  "foreignKeys": [],
  "checks": [
   {
    "name": "chatV2Conversations_createdByType_check",
    "expr": "(createdbytype is null) or ((createdbytype)::text = any ((array['manager'::character varying,'courier'::character varying])::text[]))"
   },
   {
    "name": "chatV2Conversations_kind_check",
    "expr": "(kind)::text = any ((array['general'::character varying,'direct'::character varying])::text[])"
   }
  ]
 },
 "chatV2MessageReactions": {
  "columns": {
   "id": true,
   "messageId": true,
   "conversationId": true,
   "participantType": true,
   "participantId": true,
   "emoji": true,
   "createdAt": true
  },
  "indexes": [
   {
    "name": "chatV2MessageReactions_conversation_idx",
    "unique": false,
    "keys": [
     "conversationid"
    ],
    "where": ""
   },
   {
    "name": "chatV2MessageReactions_message_idx",
    "unique": false,
    "keys": [
     "messageid"
    ],
    "where": ""
   }
  ],
  "uniques": [
   {
    "name": "chatV2MessageReactions_actor_key",
    "columns": [
     "messageId",
     "participantType",
     "participantId"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "chatV2MessageReactions_conversationId_fkey",
    "columns": [
     "conversationId"
    ],
    "refTable": "chatV2Conversations",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   },
   {
    "name": "chatV2MessageReactions_messageId_fkey",
    "columns": [
     "messageId"
    ],
    "refTable": "chatV2Messages",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "chatV2MessageReactions_emoji_check",
    "expr": "(emoji)::text = any ((array['❤️'::character varying,'🔥'::character varying,'😂'::character varying,'🤩'::character varying,'😍'::character varying,'🎉'::character varying,'💯'::character varying,'👏'::character varying,'👍'::character varying,'🤝'::character varying,'👀'::character varying,'🤯'::character varying,'✅'::character varying,'❌'::character varying,'⚠️'::character varying,'🚀'::character varying,'🎯'::character varying,'💡'::character varying,'📌'::character varying,'📦'::character varying,'⏳'::character varying,'🛠️'::character varying])::text[])"
   },
   {
    "name": "chatV2MessageReactions_participantType_check",
    "expr": "(participanttype)::text = any ((array['manager'::character varying,'courier'::character varying])::text[])"
   }
  ]
 },
 "chatV2MessageReceipts": {
  "columns": {
   "id": true,
   "messageId": true,
   "conversationId": true,
   "participantType": true,
   "participantId": true,
   "deliveredAt": false,
   "readAt": false,
   "createdAt": true
  },
  "indexes": [
   {
    "name": "chatV2MessageReceipts_conversation_idx",
    "unique": false,
    "keys": [
     "conversationid"
    ],
    "where": ""
   },
   {
    "name": "chatV2MessageReceipts_recipient_idx",
    "unique": false,
    "keys": [
     "participanttype",
     "participantid"
    ],
    "where": ""
   }
  ],
  "uniques": [
   {
    "name": "chatV2MessageReceipts_recipient_key",
    "columns": [
     "messageId",
     "participantType",
     "participantId"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "chatV2MessageReceipts_conversationId_fkey",
    "columns": [
     "conversationId"
    ],
    "refTable": "chatV2Conversations",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   },
   {
    "name": "chatV2MessageReceipts_messageId_fkey",
    "columns": [
     "messageId"
    ],
    "refTable": "chatV2Messages",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "chatV2MessageReceipts_participantType_check",
    "expr": "(participanttype)::text = any ((array['manager'::character varying,'courier'::character varying])::text[])"
   }
  ]
 },
 "chatV2Messages": {
  "columns": {
   "id": true,
   "conversationId": true,
   "senderType": true,
   "senderId": false,
   "senderNameSnapshot": true,
   "clientMessageId": false,
   "text": true,
   "replyToMessageId": false,
   "legacySource": false,
   "legacySourceId": false,
   "editedAt": false,
   "deletedAt": false,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "chatV2Messages_conversation_id_idx",
    "unique": false,
    "keys": [
     "conversationid",
     "id"
    ],
    "where": ""
   },
   {
    "name": "chatV2Messages_reply_idx",
    "unique": false,
    "keys": [
     "replytomessageid"
    ],
    "where": ""
   }
  ],
  "uniques": [
   {
    "name": "chatV2Messages_client_key",
    "columns": [
     "senderType",
     "senderId",
     "clientMessageId"
    ]
   },
   {
    "name": "chatV2Messages_legacy_key",
    "columns": [
     "legacySource",
     "legacySourceId"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "chatV2Messages_conversationId_fkey",
    "columns": [
     "conversationId"
    ],
    "refTable": "chatV2Conversations",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   },
   {
    "name": "chatV2Messages_replyToMessageId_fkey",
    "columns": [
     "replyToMessageId"
    ],
    "refTable": "chatV2Messages",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "chatV2Messages_senderType_check",
    "expr": "(sendertype)::text = any ((array['manager'::character varying,'courier'::character varying])::text[])"
   },
   {
    "name": "chatV2Messages_text_check",
    "expr": "(char_length(text) >= 1) and (char_length(text) <= 4000)"
   }
  ]
 },
 "chatV2Participants": {
  "columns": {
   "id": true,
   "conversationId": true,
   "participantType": true,
   "participantId": true,
   "lastReadMessageId": false,
   "lastReadAt": false,
   "isMuted": true,
   "joinedAt": true
  },
  "indexes": [
   {
    "name": "chatV2Participants_actor_idx",
    "unique": false,
    "keys": [
     "participanttype",
     "participantid"
    ],
    "where": ""
   },
   {
    "name": "chatV2Participants_conversation_idx",
    "unique": false,
    "keys": [
     "conversationid"
    ],
    "where": ""
   }
  ],
  "uniques": [
   {
    "name": "chatV2Participants_member_key",
    "columns": [
     "conversationId",
     "participantType",
     "participantId"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "chatV2Participants_conversationId_fkey",
    "columns": [
     "conversationId"
    ],
    "refTable": "chatV2Conversations",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "chatV2Participants_participantType_check",
    "expr": "(participanttype)::text = any ((array['manager'::character varying,'courier'::character varying])::text[])"
   }
  ]
 },
 "clientPoints": {
  "columns": {
   "id": true,
   "clientId": true,
   "name": true,
   "address": true,
   "contactPerson": false,
   "phone": false,
   "sortOrder": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "clientPortalAccounts": {
  "columns": {
   "id": true,
   "clientId": true,
   "ownerName": true,
   "login": true,
   "passwordHash": true,
   "temporaryPassword": false,
   "role": true,
   "isActive": true,
   "lastLoginAt": false,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [
   {
    "name": "clientPortalAccounts_login_key",
    "columns": [
     "login"
    ]
   }
  ],
  "foreignKeys": [],
  "checks": []
 },
 "clientRegularClients": {
  "columns": {
   "id": true,
   "clientId": true,
   "name": true,
   "address": true,
   "contactPerson": false,
   "phone": false,
   "sortOrder": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "clientTariffRules": {
  "columns": {
   "id": true,
   "clientId": true,
   "name": true,
   "requestType": false,
   "fromAddressNormalized": false,
   "toAddressNormalized": false,
   "weekdays": false,
   "firstPlacePrice": true,
   "nextPlacePrice": true,
   "priority": true,
   "isActive": true,
   "createdByManagerId": false,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "clientTariffRules_client_active_idx",
    "unique": false,
    "keys": [
     "clientid",
     "isactive"
    ],
    "where": ""
   },
   {
    "name": "clientTariffRules_client_request_type_idx",
    "unique": false,
    "keys": [
     "clientid",
     "requesttype"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": [
   {
    "name": "clientTariffRules_first_price_nonnegative",
    "expr": "firstplaceprice >= (0)::numeric"
   },
   {
    "name": "clientTariffRules_next_price_nonnegative",
    "expr": "nextplaceprice >= (0)::numeric"
   }
  ]
 },
 "clientTariffs": {
  "columns": {
   "id": true,
   "clientId": true,
   "deliveryFirstPlace": true,
   "deliveryNextPlace": true,
   "transportCompanyFirstPlace": true,
   "transportCompanyNextPlace": true,
   "movementFirstPlace": true,
   "movementNextPlace": true,
   "otherFirstPlace": true,
   "otherNextPlace": true,
   "createdAt": true,
   "updatedAt": true,
   "hemotestPointPrice": true,
   "hemotestSundayFirstPointPrice": true,
   "hemotestSundayNextPointPrice": true
  },
  "indexes": [
   {
    "name": "clientTariffs_clientId_unique",
    "unique": true,
    "keys": [
     "clientid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "clients": {
  "columns": {
   "id": true,
   "name": true,
   "address": true,
   "contactPerson": false,
   "phone": false,
   "email": false,
   "createdAt": true,
   "updatedAt": true,
   "legalName": false,
   "inn": false,
   "kpp": false,
   "legalAddress": false,
   "ogrn": false,
   "postalAddress": false
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "correspondenceAuditLog": {
  "columns": {
   "id": true,
   "managerId": false,
   "occurredAt": true,
   "action": true,
   "entityType": true,
   "entityId": true,
   "beforeData": false,
   "afterData": false
  },
  "indexes": [
   {
    "name": "correspondenceAuditLog_entity_idx",
    "unique": false,
    "keys": [
     "entitytype",
     "entityid",
     "occurredat desc",
     "id desc"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "correspondenceCarrierProfiles": {
  "columns": {
   "carrierId": true,
   "legalName": false,
   "inn": false,
   "kpp": false,
   "ogrn": false,
   "legalAddress": false,
   "postalAddress": false,
   "bankName": false,
   "bik": false,
   "bankAccount": false,
   "correspondentAccount": false,
   "contractNumber": false,
   "contractDate": false,
   "signerName": false,
   "signerPosition": false,
   "signerAuthority": false,
   "comment": false,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "correspondenceCarrierProfiles_carrierId_fkey",
    "columns": [
     "carrierId"
    ],
    "refTable": "transportCompanies",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "correspondenceCities": {
  "columns": {
   "id": true,
   "name": true,
   "region": true,
   "aliases": true,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "correspondenceCities_name_region_uidx",
    "unique": true,
    "keys": [
     "lower(btrim((name)::text))",
     "lower(btrim((region)::text))"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": [
   {
    "name": "correspondenceCities_name_check",
    "expr": "btrim((name)::text) <> ''::text"
   }
  ]
 },
 "correspondenceClientTariffItems": {
  "columns": {
   "id": true,
   "planId": true,
   "serviceCode": true,
   "cityFromId": false,
   "cityToId": false,
   "weightFromKg": false,
   "weightToKg": false,
   "pricingModel": true,
   "basePrice": false,
   "pricePerKg": false,
   "vatRate": false,
   "priority": true,
   "description": false,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "correspondenceClientTariffItems_plan_idx",
    "unique": false,
    "keys": [
     "planid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "correspondenceClientTariffItems_cityFromId_fkey",
    "columns": [
     "cityFromId"
    ],
    "refTable": "correspondenceCities",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "correspondenceClientTariffItems_cityToId_fkey",
    "columns": [
     "cityToId"
    ],
    "refTable": "correspondenceCities",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "correspondenceClientTariffItems_planId_fkey",
    "columns": [
     "planId"
    ],
    "refTable": "correspondenceClientTariffPlans",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   },
   {
    "name": "correspondenceClientTariffItems_serviceCode_fkey",
    "columns": [
     "serviceCode"
    ],
    "refTable": "correspondenceServices",
    "refColumns": [
     "code"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "correspondenceClientTariffPlans": {
  "columns": {
   "id": true,
   "ownerType": true,
   "ownerId": true,
   "name": true,
   "currency": true,
   "validFrom": false,
   "validTo": false,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "correspondenceClientTariffPlans_owner_idx",
    "unique": false,
    "keys": [
     "ownertype",
     "ownerid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "correspondenceClients": {
  "columns": {
   "id": true,
   "name": true,
   "legalName": false,
   "inn": false,
   "kpp": false,
   "legalAddress": false,
   "postalAddress": false,
   "contactPerson": false,
   "phone": false,
   "email": false,
   "contractNumber": false,
   "contractDate": false,
   "comment": false,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true,
   "ogrn": false,
   "bankName": false,
   "bik": false,
   "bankAccount": false,
   "correspondentAccount": false,
   "signerName": false,
   "signerPosition": false,
   "signerAuthority": false
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "correspondenceManifestTemplates": {
  "columns": {
   "id": true,
   "partnerId": true,
   "sheetName": false,
   "startRow": true,
   "mapping": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [
   {
    "name": "correspondenceManifestTemplates_partnerId_key",
    "columns": [
     "partnerId"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "correspondenceManifestTemplates_partnerId_fkey",
    "columns": [
     "partnerId"
    ],
    "refTable": "partners",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "correspondenceManifests": {
  "columns": {
   "id": true,
   "direction": true,
   "partnerId": false,
   "importKey": false,
   "importPayloadHash": false,
   "manifestNumber": false,
   "manifestDate": false,
   "arrivedAt": false,
   "sourceFileName": false,
   "sourceFileMime": false,
   "sourceFileSha256": false,
   "sourceFileData": false,
   "createdByManagerId": false,
   "createdAt": true,
   "updatedAt": true,
   "destinationCityId": false,
   "transportType": false,
   "carrierId": false,
   "transportWaybillNumber": false,
   "departureDate": false,
   "plannedArrivalDate": false,
   "handedOverAt": false,
   "handedOverByManagerId": false,
   "transportPayer": false,
   "transportCost": false,
   "carrierMinBillableWeight": false,
   "terminalRequired": false,
   "terminalCost": false,
   "terminalPayer": false,
   "comment": false,
   "creationKey": false,
   "creationPayloadHash": false
  },
  "indexes": [],
  "uniques": [
   {
    "name": "correspondenceManifests_creationKey_key",
    "columns": [
     "creationKey"
    ]
   },
   {
    "name": "correspondenceManifests_importKey_key",
    "columns": [
     "importKey"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "correspondenceManifests_carrierId_fkey",
    "columns": [
     "carrierId"
    ],
    "refTable": "transportCompanies",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "correspondenceManifests_destinationCityId_fkey",
    "columns": [
     "destinationCityId"
    ],
    "refTable": "correspondenceCities",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "correspondenceManifests_partnerId_fkey",
    "columns": [
     "partnerId"
    ],
    "refTable": "partners",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "correspondenceManifests_carrierMinBillableWeight_check",
    "expr": "(carrierminbillableweight >= 0.001) and (carrierminbillableweight <= 999999999.999)"
   },
   {
    "name": "correspondenceManifests_creation_key_hash_check",
    "expr": "((creationkey is null) and (creationpayloadhash is null)) or ((creationkey is not null) and (creationpayloadhash is not null) and ((creationpayloadhash)::text ~ '^[0-9a-f]{64}$'::text))"
   },
   {
    "name": "correspondenceManifests_direction_check",
    "expr": "(direction)::text = any ((array['incoming'::character varying,'outgoing'::character varying])::text[])"
   },
   {
    "name": "correspondenceManifests_terminalCost_check",
    "expr": "(terminalcost >= (0)::numeric) and (terminalcost <= 999999999999.99)"
   },
   {
    "name": "correspondenceManifests_terminalPayer_check",
    "expr": "(terminalpayer)::text = any ((array['us'::character varying,'partner'::character varying])::text[])"
   },
   {
    "name": "correspondenceManifests_transportCost_check",
    "expr": "(transportcost >= (0)::numeric) and (transportcost <= 999999999999.99)"
   },
   {
    "name": "correspondenceManifests_transportPayer_check",
    "expr": "(transportpayer)::text = any ((array['us'::character varying,'partner'::character varying])::text[])"
   },
   {
    "name": "correspondenceManifests_transportType_check",
    "expr": "(transporttype)::text = any ((array['air'::character varying,'ground'::character varying])::text[])"
   }
  ]
 },
 "correspondencePartnerProfiles": {
  "columns": {
   "partnerId": true,
   "legalName": false,
   "inn": false,
   "kpp": false,
   "ogrn": false,
   "legalAddress": false,
   "postalAddress": false,
   "bankName": false,
   "bik": false,
   "bankAccount": false,
   "correspondentAccount": false,
   "contractNumber": false,
   "contractDate": false,
   "signerName": false,
   "signerPosition": false,
   "signerAuthority": false,
   "comment": false,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "correspondencePartnerProfiles_partnerId_fkey",
    "columns": [
     "partnerId"
    ],
    "refTable": "partners",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "correspondencePartnerTariffItems": {
  "columns": {
   "id": true,
   "planId": true,
   "serviceCode": true,
   "cityFromId": false,
   "cityToId": false,
   "weightFromKg": false,
   "weightToKg": false,
   "pricingModel": true,
   "basePrice": false,
   "pricePerKg": false,
   "vatRate": false,
   "priority": true,
   "description": false,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "correspondencePartnerTariffItems_plan_idx",
    "unique": false,
    "keys": [
     "planid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "correspondencePartnerTariffItems_cityFromId_fkey",
    "columns": [
     "cityFromId"
    ],
    "refTable": "correspondenceCities",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "correspondencePartnerTariffItems_cityToId_fkey",
    "columns": [
     "cityToId"
    ],
    "refTable": "correspondenceCities",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "correspondencePartnerTariffItems_planId_fkey",
    "columns": [
     "planId"
    ],
    "refTable": "correspondencePartnerTariffPlans",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   },
   {
    "name": "correspondencePartnerTariffItems_serviceCode_fkey",
    "columns": [
     "serviceCode"
    ],
    "refTable": "correspondenceServices",
    "refColumns": [
     "code"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "correspondencePartnerTariffPlans": {
  "columns": {
   "id": true,
   "partnerId": true,
   "name": true,
   "currency": true,
   "validFrom": false,
   "validTo": false,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [
   {
    "name": "correspondencePartnerTariffPlans_partner_idx",
    "unique": false,
    "keys": [
     "partnerid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "correspondencePartnerTariffPlans_partnerId_fkey",
    "columns": [
     "partnerId"
    ],
    "refTable": "partners",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "correspondenceServices": {
  "columns": {
   "id": true,
   "code": true,
   "name": true,
   "isActive": true,
   "sortOrder": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [
   {
    "name": "correspondenceServices_code_key",
    "columns": [
     "code"
    ]
   }
  ],
  "foreignKeys": [],
  "checks": []
 },
 "correspondenceShipmentPlaces": {
  "columns": {
   "id": true,
   "shipmentId": true,
   "position": true,
   "measuredWeight": true,
   "lengthCm": false,
   "widthCm": false,
   "heightCm": false,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [
   {
    "name": "correspondenceShipmentPlaces_shipmentId_position_key",
    "columns": [
     "shipmentId",
     "position"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "correspondenceShipmentPlaces_shipmentId_fkey",
    "columns": [
     "shipmentId"
    ],
    "refTable": "correspondenceShipments",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "correspondenceShipmentPlaces_dimensions_check",
    "expr": "((lengthcm is null) and (widthcm is null) and (heightcm is null)) or ((lengthcm is not null) and (widthcm is not null) and (heightcm is not null))"
   },
   {
    "name": "correspondenceShipmentPlaces_heightCm_check",
    "expr": "(heightcm >= 0.01) and (heightcm <= 99999999.99)"
   },
   {
    "name": "correspondenceShipmentPlaces_lengthCm_check",
    "expr": "(lengthcm >= 0.01) and (lengthcm <= 99999999.99)"
   },
   {
    "name": "correspondenceShipmentPlaces_measuredWeight_check",
    "expr": "(measuredweight >= 0.001) and (measuredweight <= 999999999.999)"
   },
   {
    "name": "correspondenceShipmentPlaces_position_check",
    "expr": "position > 0"
   },
   {
    "name": "correspondenceShipmentPlaces_widthCm_check",
    "expr": "(widthcm >= 0.01) and (widthcm <= 99999999.99)"
   }
  ]
 },
 "correspondenceShipments": {
  "columns": {
   "id": true,
   "mailId": false,
   "manifestId": false,
   "direction": true,
   "ownerType": false,
   "ownerId": false,
   "waybillDate": false,
   "senderCity": false,
   "senderName": false,
   "senderCompany": false,
   "senderPhone": false,
   "senderPostalCode": false,
   "senderAddress": false,
   "recipientRegion": false,
   "recipientCityRaw": false,
   "recipientCityNormalized": false,
   "recipientName": false,
   "recipientCompany": false,
   "recipientPhone": false,
   "recipientPostalCode": false,
   "recipientAddress": false,
   "declaredValue": false,
   "manifestWeight": false,
   "volumetricWeight": false,
   "measuredWeight": false,
   "placesCount": false,
   "contents": false,
   "senderNotes": false,
   "paymentMethod": false,
   "payer": false,
   "specialConditions": false,
   "archivedAt": false,
   "createdAt": true,
   "updatedAt": true,
   "waybillNumber": false,
   "destinationCityId": false,
   "outgoingManifestId": false,
   "acceptedAt": false,
   "acceptedByManagerId": false,
   "intakeKey": false,
   "intakePayloadHash": false,
   "partnerId": false,
   "billableWeight": false
  },
  "indexes": [
   {
    "name": "correspondenceShipments_archive_created_idx",
    "unique": false,
    "keys": [
     "archivedat",
     "createdat desc"
    ],
    "where": ""
   },
   {
    "name": "correspondenceShipments_destinationCityId_idx",
    "unique": false,
    "keys": [
     "destinationcityid"
    ],
    "where": ""
   },
   {
    "name": "correspondenceShipments_manifestId_idx",
    "unique": false,
    "keys": [
     "manifestid"
    ],
    "where": ""
   },
   {
    "name": "correspondenceShipments_outgoingManifestId_idx",
    "unique": false,
    "keys": [
     "outgoingmanifestid"
    ],
    "where": ""
   },
   {
    "name": "correspondenceShipments_partnerId_idx",
    "unique": false,
    "keys": [
     "partnerid"
    ],
    "where": ""
   },
   {
    "name": "correspondenceShipments_waybillNumber_uidx",
    "unique": true,
    "keys": [
     "lower(btrim((waybillnumber)::text))"
    ],
    "where": "waybillnumber is not null"
   }
  ],
  "uniques": [
   {
    "name": "correspondenceShipments_intakeKey_key",
    "columns": [
     "intakeKey"
    ]
   },
   {
    "name": "correspondenceShipments_mailId_key",
    "columns": [
     "mailId"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "correspondenceShipments_destinationCityId_fkey",
    "columns": [
     "destinationCityId"
    ],
    "refTable": "correspondenceCities",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "correspondenceShipments_mailId_fkey",
    "columns": [
     "mailId"
    ],
    "refTable": "mails",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "correspondenceShipments_manifestId_fkey",
    "columns": [
     "manifestId"
    ],
    "refTable": "correspondenceManifests",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   },
   {
    "name": "correspondenceShipments_outgoingManifestId_fkey",
    "columns": [
     "outgoingManifestId"
    ],
    "refTable": "correspondenceManifests",
    "refColumns": [
     "id"
    ],
    "onDelete": "restrict",
    "onUpdate": "no action"
   },
   {
    "name": "correspondenceShipments_partnerId_fkey",
    "columns": [
     "partnerId"
    ],
    "refTable": "partners",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "correspondenceShipments_direction_check",
    "expr": "(direction)::text = any ((array['incoming'::character varying,'outgoing'::character varying])::text[])"
   },
   {
    "name": "correspondenceShipments_intake_key_hash_check",
    "expr": "((intakekey is null) and (intakepayloadhash is null)) or ((intakekey is not null) and (intakepayloadhash is not null) and ((intakepayloadhash)::text ~ '^[0-9a-f]{64}$'::text))"
   },
   {
    "name": "correspondenceShipments_mail_or_outgoing_waybill_check",
    "expr": "(mailid is not null) or (((direction)::text = 'outgoing'::text) and (waybillnumber is not null))"
   },
   {
    "name": "correspondenceShipments_ownerType_check",
    "expr": "(ownertype)::text = any ((array['client'::character varying,'partner'::character varying])::text[])"
   },
   {
    "name": "correspondenceShipments_waybillNumber_check",
    "expr": "btrim((waybillnumber)::text) <> ''::text"
   }
  ]
 },
 "courierAccess": {
  "columns": {
   "courierId": true,
   "allowedDaysMask": true,
   "tasksAllowed": true,
   "hemotestAllowed": true,
   "sberbankAllowed": true,
   "mailsAllowed": true,
   "chatAllowed": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "courierAccess_courierId_fkey",
    "columns": [
     "courierId"
    ],
    "refTable": "couriers",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "couriers": {
  "columns": {
   "id": true,
   "userId": false,
   "name": true,
   "username": true,
   "passwordHash": true,
   "phone": false,
   "vehicleType": true,
   "isActive": true,
   "totalDeliveries": true,
   "urgencyThresholdOrange": true,
   "urgencyThresholdRed": true,
   "createdAt": true,
   "updatedAt": true,
   "pushToken": false,
   "displayColor": true,
   "displayIcon": true
  },
  "indexes": [
   {
    "name": "idx_couriers_username",
    "unique": false,
    "keys": [
     "username"
    ],
    "where": ""
   }
  ],
  "uniques": [
   {
    "name": "couriers_username_unique",
    "columns": [
     "username"
    ]
   }
  ],
  "foreignKeys": [],
  "checks": []
 },
 "hemotestListItems": {
  "columns": {
   "id": true,
   "listId": true,
   "pointId": true,
   "createdAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "hemotestPickupLists": {
  "columns": {
   "id": true,
   "createdByUserId": false,
   "date": true,
   "name": true,
   "status": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "hemotestPickupPoints": {
  "columns": {
   "id": true,
   "name": true,
   "address": true,
   "createdAt": true,
   "updatedAt": true,
   "isActive": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "hemotestPickups": {
  "columns": {
   "id": true,
   "pointId": true,
   "courierId": false,
   "date": true,
   "isPicked": true,
   "pickedAt": false,
   "createdAt": true,
   "updatedAt": true,
   "isCancelled": true,
   "cancelledAt": false
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "mails": {
  "columns": {
   "id": true,
   "waybillNumber": true,
   "recipientName": false,
   "recipientPhone": false,
   "deliveryAddress": true,
   "mailStatus": true,
   "recipientSignature": false,
   "deliveredAt": false,
   "courierId": false,
   "createdAt": true,
   "updatedAt": true,
   "status": true,
   "partnerId": false,
   "weight": false,
   "billingCheckedAt": false,
   "billingCheckedByManagerId": false
  },
  "indexes": [
   {
    "name": "idx_mails_createdAt",
    "unique": false,
    "keys": [
     "createdat"
    ],
    "where": ""
   },
   {
    "name": "idx_mails_status",
    "unique": false,
    "keys": [
     "status"
    ],
    "where": ""
   },
   {
    "name": "idx_mails_waybillNumber",
    "unique": false,
    "keys": [
     "waybillnumber"
    ],
    "where": ""
   },
   {
    "name": "mails_partnerId_idx",
    "unique": false,
    "keys": [
     "partnerid"
    ],
    "where": ""
   }
  ],
  "uniques": [
   {
    "name": "mails_waybillNumber_unique",
    "columns": [
     "waybillNumber"
    ]
   }
  ],
  "foreignKeys": [],
  "checks": []
 },
 "managerChatMessages": {
  "columns": {
   "id": true,
   "senderName": true,
   "senderRole": true,
   "text": true,
   "createdAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "managers": {
  "columns": {
   "id": true,
   "username": true,
   "password": true,
   "name": true,
   "email": true,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true,
   "passwordHash": true,
   "phone": false,
   "role": false
  },
  "indexes": [],
  "uniques": [
   {
    "name": "managers_email_unique",
    "columns": [
     "email"
    ]
   },
   {
    "name": "managers_username_unique",
    "columns": [
     "username"
    ]
   }
  ],
  "foreignKeys": [],
  "checks": []
 },
 "max_client_chats": {
  "columns": {
   "id": true,
   "client_id": true,
   "invite_url": true,
   "chat_id": false,
   "enabled": true,
   "verified_at": false,
   "created_at": true,
   "updated_at": true,
   "connect_code_hash": false,
   "connect_expires_at": false
  },
  "indexes": [
   {
    "name": "max_client_chats_client_id_idx",
    "unique": false,
    "keys": [
     "client_id"
    ],
    "where": ""
   },
   {
    "name": "max_client_chats_code_hash_idx",
    "unique": true,
    "keys": [
     "connect_code_hash"
    ],
    "where": "connect_code_hash is not null"
   }
  ],
  "uniques": [
   {
    "name": "max_client_chats_chat_id_key",
    "columns": [
     "chat_id"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "max_client_chats_client_id_fkey",
    "columns": [
     "client_id"
    ],
    "refTable": "clients",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "max_chat_enabled_requires_verification",
    "expr": "(not enabled) or ((chat_id is not null) and (verified_at is not null))"
   },
   {
    "name": "max_chat_invite_url_length",
    "expr": "char_length(invite_url) <= 1000"
   }
  ]
 },
 "max_manager_links": {
  "columns": {
   "max_user_id": true,
   "manager_id": true,
   "enabled": true,
   "can_approve": true,
   "created_at": true,
   "updated_at": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "max_manager_links_manager_id_fkey",
    "columns": [
     "manager_id"
    ],
    "refTable": "managers",
    "refColumns": [
     "id"
    ],
    "onDelete": "no action",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "max_manager_links_max_user_id_check",
    "expr": "max_user_id ~ '^\\d{1,20}$'::text"
   }
  ]
 },
 "max_order_drafts": {
  "columns": {
   "id": true,
   "chat_binding_id": true,
   "max_user_id": true,
   "request_data": true,
   "status": true,
   "request_id": false,
   "idempotency_key": true,
   "max_message_id": false,
   "reviewed_by": false,
   "reviewed_at": false,
   "created_at": true,
   "updated_at": true,
   "qr_original": false,
   "qr_mime": false,
   "last_notified_status": false
  },
  "indexes": [
   {
    "name": "max_order_drafts_chat_idx",
    "unique": false,
    "keys": [
     "chat_binding_id",
     "created_at desc"
    ],
    "where": ""
   }
  ],
  "uniques": [
   {
    "name": "max_order_drafts_idempotency_key_key",
    "columns": [
     "idempotency_key"
    ]
   }
  ],
  "foreignKeys": [
   {
    "name": "max_order_drafts_chat_binding_id_fkey",
    "columns": [
     "chat_binding_id"
    ],
    "refTable": "max_client_chats",
    "refColumns": [
     "id"
    ],
    "onDelete": "no action",
    "onUpdate": "no action"
   },
   {
    "name": "max_order_drafts_request_id_fkey",
    "columns": [
     "request_id"
    ],
    "refTable": "requests",
    "refColumns": [
     "id"
    ],
    "onDelete": "no action",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "max_order_drafts_status_check",
    "expr": "status = any (array['pending'::text,'approving'::text,'approved'::text,'rejected'::text,'failed'::text])"
   }
  ]
 },
 "max_time_selection_messages": {
  "columns": {
   "message_id": true,
   "draft_id": true,
   "chat_id": true,
   "created_by": true,
   "created_at": true,
   "expires_at": true
  },
  "indexes": [
   {
    "name": "max_time_selection_draft_idx",
    "unique": false,
    "keys": [
     "draft_id",
     "expires_at"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "max_time_selection_messages_draft_id_fkey",
    "columns": [
     "draft_id"
    ],
    "refTable": "max_order_drafts",
    "refColumns": [
     "id"
    ],
    "onDelete": "cascade",
    "onUpdate": "no action"
   }
  ],
  "checks": []
 },
 "partners": {
  "columns": {
   "id": true,
   "name": true,
   "email": false,
   "contactPerson": false,
   "phone": false,
   "comment": false,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true,
   "isOwnCompany": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "requestActivity": {
  "columns": {
   "id": true,
   "requestId": true,
   "actorType": true,
   "actorId": false,
   "actorName": false,
   "action": true,
   "note": false,
   "changes": false,
   "createdAt": true
  },
  "indexes": [
   {
    "name": "requestActivity_createdAt_idx",
    "unique": false,
    "keys": [
     "createdat"
    ],
    "where": ""
   },
   {
    "name": "requestActivity_requestId_idx",
    "unique": false,
    "keys": [
     "requestid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "requestAttachments": {
  "columns": {
   "id": true,
   "requestId": true,
   "originalName": true,
   "storedName": true,
   "fileUrl": true,
   "mimeType": false,
   "sizeBytes": true,
   "createdAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "requests": {
  "columns": {
   "id": true,
   "createdByUserId": true,
   "requestType": true,
   "requestStatus": true,
   "courierId": false,
   "clientId": false,
   "recipientName": false,
   "recipientPhone": false,
   "recipientAddress": false,
   "deliveryAddress": false,
   "deliveryCity": false,
   "packageDescription": false,
   "packageType": false,
   "placesCount": false,
   "senderName": false,
   "senderCompany": false,
   "senderCity": false,
   "senderAddress": false,
   "senderPhone": false,
   "recipientCompany": false,
   "recipientCity": false,
   "items": false,
   "totalAmount": false,
   "callReason": false,
   "tcName": false,
   "tcAddress": false,
   "trackingNumber": false,
   "description": false,
   "specialInstructions": false,
   "comments": false,
   "paymentMethod": false,
   "paymentAmount": false,
   "deliveryTimeFrom": false,
   "deliveryTimeTo": false,
   "estimatedMinutes": false,
   "scheduledAt": false,
   "acceptedAt": false,
   "completedAt": false,
   "rejectionReason": false,
   "createdAt": true,
   "updatedAt": true,
   "status": true,
   "deliveryFee": false,
   "billingCheckedAt": false,
   "billingCheckedByManagerId": false,
   "scheduledPushSentAt": false,
   "requesterType": false,
   "requesterId": false,
   "requesterNameSnapshot": false,
   "quoteCalculatedAt": false,
   "quoteSource": false,
   "billingReviewState": false,
   "billingReviewNote": false,
   "quoteTariffRuleId": false,
   "quoteTariffSnapshot": false
  },
  "indexes": [
   {
    "name": "idx_requests_courierId",
    "unique": false,
    "keys": [
     "courierid"
    ],
    "where": ""
   },
   {
    "name": "idx_requests_status",
    "unique": false,
    "keys": [
     "status"
    ],
    "where": ""
   },
   {
    "name": "requests_client_status_completed_idx",
    "unique": false,
    "keys": [
     "clientid",
     "status",
     "completedat"
    ],
    "where": ""
   },
   {
    "name": "requests_quote_tariff_rule_idx",
    "unique": false,
    "keys": [
     "quotetariffruleid"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [
   {
    "name": "requests_billingCheckedByManagerId_managers_id_fk",
    "columns": [
     "billingCheckedByManagerId"
    ],
    "refTable": "managers",
    "refColumns": [
     "id"
    ],
    "onDelete": "set null",
    "onUpdate": "no action"
   }
  ],
  "checks": [
   {
    "name": "requests_billingReviewState_valid",
    "expr": "(billingreviewstate is null) or ((billingreviewstate)::text = any ((array['cancelled_confirmed'::character varying,'completed_confirmed'::character varying,'requires_clarification'::character varying,'not_billable'::character varying])::text[]))"
   },
   {
    "name": "requests_quoteSource_valid",
    "expr": "(quotesource is null) or ((quotesource)::text = any ((array['tariff'::character varying,'manual_fee'::character varying])::text[]))"
   }
  ]
 },
 "sberbankListItems": {
  "columns": {
   "id": true,
   "listId": true,
   "pointId": true,
   "createdAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "sberbankPickupLists": {
  "columns": {
   "id": true,
   "createdByUserId": false,
   "dayOfWeek": true,
   "name": true,
   "status": true,
   "createdAt": true,
   "updatedAt": true,
   "date": false
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "sberbankPickupPoints": {
  "columns": {
   "id": true,
   "name": true,
   "address": true,
   "createdAt": true,
   "updatedAt": true,
   "isActive": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "sberbankPickupSchedule": {
  "columns": {
   "id": true,
   "dayOfWeek": true,
   "pointId": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "sberbankPickups": {
  "columns": {
   "id": true,
   "pointId": true,
   "courierId": false,
   "date": true,
   "isPicked": true,
   "pickedAt": false,
   "createdAt": true,
   "updatedAt": true,
   "isCancelled": true,
   "cancelledAt": false
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "settings": {
  "columns": {
   "id": true,
   "nutsTariff": false,
   "cedroilTariff": false,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "taskStatusHistory": {
  "columns": {
   "id": true,
   "taskId": true,
   "status": true,
   "changedByUserId": false,
   "note": false,
   "createdAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "tasks": {
  "columns": {
   "id": true,
   "createdByUserId": false,
   "courierId": false,
   "status": true,
   "taskType": true,
   "recipientName": true,
   "recipientPhone": false,
   "deliveryAddress": true,
   "deliveryCity": false,
   "packageDescription": false,
   "packageType": true,
   "specialInstructions": false,
   "placesCount": false,
   "estimatedMinutes": false,
   "deliveryTimeFrom": false,
   "deliveryTimeTo": false,
   "recipientAddress": false,
   "senderName": false,
   "senderAddress": false,
   "senderPhone": false,
   "comments": false,
   "courierComments": false,
   "items": false,
   "rejectionReason": false,
   "scheduledAt": false,
   "acceptedAt": false,
   "completedAt": false,
   "createdAt": true,
   "updatedAt": true,
   "requestId": false,
   "sourceRequestId": false
  },
  "indexes": [
   {
    "name": "idx_tasks_courierId",
    "unique": false,
    "keys": [
     "courierid"
    ],
    "where": ""
   },
   {
    "name": "idx_tasks_requestId",
    "unique": false,
    "keys": [
     "requestid"
    ],
    "where": ""
   },
   {
    "name": "idx_tasks_sourceRequestId",
    "unique": true,
    "keys": [
     "sourcerequestid"
    ],
    "where": "sourcerequestid is not null"
   },
   {
    "name": "idx_tasks_status",
    "unique": false,
    "keys": [
     "status"
    ],
    "where": ""
   }
  ],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "transportCompanies": {
  "columns": {
   "id": true,
   "name": true,
   "address": true,
   "contactPerson": false,
   "phone": false,
   "comment": false,
   "isActive": true,
   "createdAt": true,
   "updatedAt": true
  },
  "indexes": [],
  "uniques": [],
  "foreignKeys": [],
  "checks": []
 },
 "users": {
  "columns": {
   "id": true,
   "openId": true,
   "name": false,
   "email": false,
   "loginMethod": false,
   "role": true,
   "createdAt": true,
   "updatedAt": true,
   "lastSignedIn": true
  },
  "indexes": [],
  "uniques": [
   {
    "name": "users_openId_unique",
    "columns": [
     "openId"
    ]
   }
  ],
  "foreignKeys": [],
  "checks": []
 }
};

/** Production name vs drizzle-generated name for the keys declared lazily (.references). */
const KNOWN_FK_NAME_DIFFERENCES: Record<string, string> = {};

const dialect = new PgDialect();
const sqlText = (v: unknown): string => { try { return dialect.sqlToQuery(v as never).sql; } catch { return ""; } };

function canon(input: unknown): string {
  let s = String(input ?? "").replace(/\s+/g, " ").trim().replace(/"/g, "").replace(/,\s+/g, ",").replace(/public\./g, "");
  let changed = true;
  while (changed && s.startsWith("(") && s.endsWith(")")) {
    changed = false; let depth = 0, balanced = true;
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] === "(") depth += 1;
      else if (s[i] === ")") { depth -= 1; if (depth === 0 && i < s.length - 1) { balanced = false; break; } }
    }
    if (balanced) { s = s.slice(1, -1).trim(); changed = true; }
  }
  return s.toLowerCase();
}

const tables = Object.values(schema)
  .map((v) => { try { return getTableConfig(v as never); } catch { return null; } })
  .filter((m): m is ReturnType<typeof getTableConfig> => Boolean(m && (m as { name?: string }).name && (m as { columns?: unknown[] }).columns));
const byName = new Map(tables.map((t) => [t.name, t]));
const colName = (v: unknown) => (v && typeof v === "object" && typeof (v as { name?: string }).name === "string" ? (v as { name: string }).name : null);

describe(`drizzle/schema.ts: паритет определений со снимком production ${SNAPSHOT_DATE}`, () => {
  it("описывает те же 46 таблиц", () => {
    expect([...byName.keys()].sort()).toEqual(Object.keys(SNAPSHOT).sort());
  });

  it("совпадает по колонкам и NULL/NOT NULL", () => {
    const problems: string[] = [];
    for (const [table, expected] of Object.entries(SNAPSHOT)) {
      const meta = byName.get(table);
      if (!meta) { problems.push(`${table}: таблица отсутствует`); continue; }
      const actual = new Map(meta.columns.map((c) => [(c as { name: string }).name, Boolean((c as { notNull?: boolean }).notNull)]));
      for (const [column, notNull] of Object.entries(expected.columns)) {
        if (!actual.has(column)) problems.push(`${table}.${column}: колонки нет в схеме`);
        else if (actual.get(column) !== notNull) problems.push(`${table}.${column}: NOT NULL — БД ${notNull}, схема ${actual.get(column)}`);
      }
      for (const extra of actual.keys()) if (!(extra in expected.columns)) problems.push(`${table}.${extra}: лишняя колонка`);
    }
    expect(problems).toEqual([]);
  });

  it("совпадает по индексам: уникальность, колонки/выражения, частичные предикаты", () => {
    const problems: string[] = [];
    for (const [table, expected] of Object.entries(SNAPSHOT)) {
      const meta = byName.get(table);
      if (!meta) continue;
      const actual = (meta.indexes ?? []).map((ix) => {
        const cfg = (ix as { config?: { name?: string; unique?: boolean; columns?: unknown[]; where?: unknown } }).config ?? {};
        return { name: cfg.name ?? "?", unique: Boolean(cfg.unique),
                 keys: (cfg.columns ?? []).map((c) => canon(colName(c) ?? sqlText(c))),
                 where: cfg.where ? canon(sqlText(cfg.where)) : "" };
      });
      for (const e of expected.indexes) {
        const a = actual.find((x) => x.name === e.name);
        if (!a) { problems.push(`${table}.${e.name}: индекс не объявлен`); continue; }
        if (a.unique !== e.unique) problems.push(`${table}.${e.name}: unique — БД ${e.unique}, схема ${a.unique}`);
        if (JSON.stringify(a.keys) !== JSON.stringify(e.keys.map(canon)))
          problems.push(`${table}.${e.name}: колонки/выражение — БД [${e.keys.join(", ")}], схема [${a.keys.join(", ")}]`);
        if (a.where !== canon(e.where))
          problems.push(`${table}.${e.name}: предикат — БД «${e.where}», схема «${a.where}»`);
      }
      for (const a of actual) if (!expected.indexes.some((x) => x.name === a.name)) problems.push(`${table}.${a.name}: лишний индекс`);
    }
    expect(problems).toEqual([]);
  });

  it("совпадает по внешним ключам: колонки, целевые таблицы и ON DELETE/ON UPDATE", () => {
    const problems: string[] = [];
    const seenNameDiffs: string[] = [];
    for (const [table, expected] of Object.entries(SNAPSHOT)) {
      const meta = byName.get(table);
      if (!meta) continue;
      const actual = (meta.foreignKeys ?? []).map((fk) => {
        const ref = (fk as { reference?: () => { columns: unknown[]; foreignTable: unknown; foreignColumns: unknown[] } }).reference?.();
        return {
          name: (fk as { getName?: () => string }).getName?.() ?? "?",
          columns: (ref?.columns ?? []).map(colName),
          refTable: ref ? getTableConfig(ref.foreignTable as never).name : "?",
          refColumns: (ref?.foreignColumns ?? []).map(colName),
          onDelete: (fk as { onDelete?: string }).onDelete ?? "no action",
          onUpdate: (fk as { onUpdate?: string }).onUpdate ?? "no action",
        };
      });
      for (const e of expected.foreignKeys) {
        const a = actual.find((x) => x.name === e.name)
          ?? actual.find((x) => x.name === KNOWN_FK_NAME_DIFFERENCES[`${table}.${e.name}`]);
        if (!a) { problems.push(`${table}.${e.name}: внешний ключ не объявлен`); continue; }
        if (a.name !== e.name) seenNameDiffs.push(`${table}.${e.name}`);
        if (JSON.stringify(a.columns) !== JSON.stringify(e.columns)) problems.push(`${table}.${e.name}: колонки — БД [${e.columns}], схема [${a.columns}]`);
        if (a.refTable !== e.refTable) problems.push(`${table}.${e.name}: цель — БД ${e.refTable}, схема ${a.refTable}`);
        if (JSON.stringify(a.refColumns) !== JSON.stringify(e.refColumns)) problems.push(`${table}.${e.name}: целевые колонки — БД [${e.refColumns}], схема [${a.refColumns}]`);
        if (canon(a.onDelete) !== canon(e.onDelete)) problems.push(`${table}.${e.name}: ON DELETE — БД ${e.onDelete}, схема ${a.onDelete}`);
        if (canon(a.onUpdate) !== canon(e.onUpdate)) problems.push(`${table}.${e.name}: ON UPDATE — БД ${e.onUpdate}, схема ${a.onUpdate}`);
      }
      for (const a of actual) if (!expected.foreignKeys.some((x) => x.name === a.name || KNOWN_FK_NAME_DIFFERENCES[`${table}.${x.name}`] === a.name))
        problems.push(`${table}.${a.name}: лишний внешний ключ`);
    }
    expect(problems).toEqual([]);
    expect(seenNameDiffs.sort()).toEqual(Object.keys(KNOWN_FK_NAME_DIFFERENCES).sort());
  });

  it("совпадает по CHECK-выражениям", () => {
    const problems: string[] = [];
    for (const [table, expected] of Object.entries(SNAPSHOT)) {
      const meta = byName.get(table);
      if (!meta) continue;
      const actual = (meta.checks ?? []).map((ck) => ({ name: (ck as { name?: string }).name ?? "?",
                                                        expr: canon(sqlText((ck as { value?: unknown }).value)) }));
      for (const e of expected.checks) {
        const a = actual.find((x) => x.name === e.name);
        if (!a) { problems.push(`${table}.${e.name}: CHECK не объявлен`); continue; }
        if (a.expr !== canon(e.expr)) problems.push(`${table}.${e.name}: выражение — БД «${canon(e.expr)}», схема «${a.expr}»`);
      }
      for (const a of actual) if (!expected.checks.some((x) => x.name === a.name)) problems.push(`${table}.${a.name}: лишний CHECK`);
    }
    expect(problems).toEqual([]);
  });

  it("совпадает по уникальным ограничениям и колоночным .unique()", () => {
    const problems: string[] = [];
    for (const [table, expected] of Object.entries(SNAPSHOT)) {
      const meta = byName.get(table);
      if (!meta) continue;
      const actual = (meta.uniqueConstraints ?? []).map((uc) => ({
        name: (uc as { name?: string }).name ?? "?",
        columns: ((uc as { columns?: unknown[] }).columns ?? []).map(colName),
      }));
      for (const c of meta.columns) {
        const col = c as { name: string; isUnique?: boolean; uniqueName?: string };
        if (col.isUnique) actual.push({ name: col.uniqueName && col.uniqueName !== col.name ? col.uniqueName : `${table}_${col.name}_unique`, columns: [col.name] });
      }
      for (const e of expected.uniques) {
        const a = actual.find((x) => x.name === e.name && JSON.stringify(x.columns) === JSON.stringify(e.columns));
        if (!a) problems.push(`${table}.${e.name}: уникальное ограничение не объявлено (${e.columns.join(",")})`);
      }
    }
    expect(problems).toEqual([]);
  });
});
