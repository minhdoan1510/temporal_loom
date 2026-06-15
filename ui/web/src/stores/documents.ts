import { create } from "zustand";
import { getAllItems, putItem, deleteItem } from "@/lib/db";

export interface Document {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  sectionId: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentSection {
  id: string;
  workspaceId: string;
  name: string;
}

export interface ExternalLink {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  description: string | null;
  sectionId: string | null;
  isPinned: boolean;
}

interface DocumentsState {
  documents: Document[];
  sections: DocumentSection[];
  links: ExternalLink[];
  loading: boolean;
  loadFromDB: () => Promise<void>;
  createDocument: (workspaceId: string, title: string, content: string, sectionId: string | null) => Promise<string>;
  updateDocument: (id: string, updates: Partial<Omit<Document, "id" | "workspaceId" | "createdAt">>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  createSection: (workspaceId: string, name: string) => Promise<string>;
  updateSection: (id: string, name: string) => Promise<void>;
  deleteSection: (id: string) => Promise<void>;
  createLink: (workspaceId: string, title: string, url: string, description: string | null, sectionId: string | null) => Promise<string>;
  updateLink: (id: string, updates: Partial<Omit<ExternalLink, "id" | "workspaceId">>) => Promise<void>;
  deleteLink: (id: string) => Promise<void>;
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  sections: [],
  links: [],
  loading: true,

  loadFromDB: async () => {
    try {
      const docs = await getAllItems<Document>("documents");
      const secs = await getAllItems<DocumentSection>("sections");
      const lnks = await getAllItems<ExternalLink>("links");

      if (docs.length === 0 && secs.length === 0 && lnks.length === 0) {
        // Seed initial mock data for the default workspace
        const defaultWorkspaceId = "default";
        
        const mockSections: DocumentSection[] = [
          { id: "sec-guides", workspaceId: defaultWorkspaceId, name: "Guides & Reference" },
          { id: "sec-notes", workspaceId: defaultWorkspaceId, name: "Meeting Notes" },
        ];

        const mockDocs: Document[] = [
          {
            id: "doc-playbook",
            workspaceId: defaultWorkspaceId,
            title: "Lending Support Operations Playbook",
            content: `# Lending Support Operations Playbook

Welcome to the operations playbook for the Lending Claw platform. This guide outlines standard operating procedures for investigating and resolving client loan issues.

## 1. Ticket Triage Workflow
When a customer ticket is escalated from CS, follow these steps:
- **Analyze Ticket**: Identify Zalo ID, Loan Application ID, and issue type (e.g., Disbursement failure, Repayment mismatch).
- **Run Tool Checks**: 
  - Call \`get_customer_loans\` to inspect current loans.
  - Call \`get_loan_detail\` for specific application status.
  - Query \`search_http_errors\` if logs show errors.

## 2. Common Scenarios & Resolutions

### Disbursement Failed (Status: FAILED)
- **Cause**: Bank transfer failure, partner downtime, or incorrect bank account.
- **Action**: Check OpenSearch logs using \`get_logs_by_trace_id\` to confirm the partner response code. Contact finance if funds were locked.

### Repayment Pending (Double payment)
- **Cause**: Customer repaid twice within the same cycle.
- **Action**: Verify payments in the database. Open JIRA ticket for CS reimbursement.

## 3. Communication Guidelines
Keep replies concise, clear, and professional. Always attach relevant trace IDs or loan identifiers when updating tickets.
`,
            sectionId: "sec-guides",
            isPinned: true,
            createdAt: new Date().toLocaleDateString(),
            updatedAt: new Date().toLocaleDateString(),
          },
          {
            id: "doc-replies",
            workspaceId: defaultWorkspaceId,
            title: "Standard Response Templates",
            content: `# Standard Response Templates

Use these templates to quickly formulate standard responses for CS tickets. Modify bracketed placeholders \`[like this]\` before posting.

## Disbursement Delays
> We have investigated the disbursement issue for loan ID \`[LOAN_ID]\`. The transaction failed due to bank partner connectivity issues. We have re-triggered the payout process, and the funds should arrive within 2 hours.

## Interest Recalculation Approval
> Following a review of the interest calculation mismatch for ticket \`[TICKET_ID]\`, we verified that a late-fee correction was required. The system has updated, and the customer's outstanding balance is now adjusted. Please notify the user.

## Technical Issue Escalation
> The logs for application \`[APP_ID]\` show database connection timeouts during the signature phase. We have resolved the system lock, and the user can now re-submit their application.
`,
            sectionId: "sec-guides",
            isPinned: false,
            createdAt: new Date().toLocaleDateString(),
            updatedAt: new Date().toLocaleDateString(),
          },
        ];

        const mockLinks: ExternalLink[] = [
          {
            id: "lnk-devportal",
            workspaceId: defaultWorkspaceId,
            title: "Zalopay Developer Portal",
            url: "https://developers.zalopay.vn",
            description: "Official documentation for Zalopay merchant integration, APIs, and partner callbacks.",
            sectionId: "sec-guides",
            isPinned: true,
          },
          {
            id: "lnk-jira",
            workspaceId: defaultWorkspaceId,
            title: "Lending Operations JIRA Board",
            url: "https://jira.zalopay.vn",
            description: "Direct queue access to outstanding CS escalation tickets and bug reports.",
            sectionId: "sec-notes",
            isPinned: false,
          },
        ];

        // Save mock data to DB
        for (const sec of mockSections) await putItem("sections", sec);
        for (const doc of mockDocs) await putItem("documents", doc);
        for (const lnk of mockLinks) await putItem("links", lnk);

        set({
          documents: mockDocs,
          sections: mockSections,
          links: mockLinks,
          loading: false,
        });
      } else {
        set({
          documents: docs,
          sections: secs,
          links: lnks,
          loading: false,
        });
      }
    } catch (e) {
      console.error("Failed to load documents from IndexedDB", e);
      set({ loading: false });
    }
  },

  createDocument: async (workspaceId, title, content, sectionId) => {
    const id = `doc-${Date.now()}`;
    const newDoc: Document = {
      id,
      workspaceId,
      title,
      content,
      sectionId,
      isPinned: false,
      createdAt: new Date().toLocaleString(),
      updatedAt: new Date().toLocaleString(),
    };

    const updated = [...get().documents, newDoc];
    set({ documents: updated });
    await putItem("documents", newDoc);
    return id;
  },

  updateDocument: async (id, updates) => {
    const updatedDocs = get().documents.map((doc) => {
      if (doc.id === id) {
        const updatedDoc = {
          ...doc,
          ...updates,
          updatedAt: new Date().toLocaleString(),
        };
        // Async db save
        putItem("documents", updatedDoc);
        return updatedDoc;
      }
      return doc;
    });
    set({ documents: updatedDocs });
  },

  deleteDocument: async (id) => {
    const filtered = get().documents.filter((doc) => doc.id !== id);
    set({ documents: filtered });
    await deleteItem("documents", id);
  },

  createSection: async (workspaceId, name) => {
    const id = `sec-${Date.now()}`;
    const newSec: DocumentSection = {
      id,
      workspaceId,
      name,
    };

    const updated = [...get().sections, newSec];
    set({ sections: updated });
    await putItem("sections", newSec);
    return id;
  },

  updateSection: async (id, name) => {
    const updatedSecs = get().sections.map((sec) => {
      if (sec.id === id) {
        const updatedSec = { ...sec, name };
        putItem("sections", updatedSec);
        return updatedSec;
      }
      return sec;
    });
    set({ sections: updatedSecs });
  },

  deleteSection: async (id) => {
    const filteredSecs = get().sections.filter((sec) => sec.id !== id);
    
    // Cleanup: Set documents and links in this section to have sectionId = null
    const updatedDocs = get().documents.map((doc) => {
      if (doc.sectionId === id) {
        const updatedDoc = { ...doc, sectionId: null, updatedAt: new Date().toLocaleString() };
        putItem("documents", updatedDoc);
        return updatedDoc;
      }
      return doc;
    });

    const updatedLinks = get().links.map((lnk) => {
      if (lnk.sectionId === id) {
        const updatedLnk = { ...lnk, sectionId: null };
        putItem("links", updatedLnk);
        return updatedLnk;
      }
      return lnk;
    });

    set({
      sections: filteredSecs,
      documents: updatedDocs,
      links: updatedLinks,
    });
    await deleteItem("sections", id);
  },

  createLink: async (workspaceId, title, url, description, sectionId) => {
    const id = `lnk-${Date.now()}`;
    const newLink: ExternalLink = {
      id,
      workspaceId,
      title,
      url,
      description,
      sectionId,
      isPinned: false,
    };

    const updated = [...get().links, newLink];
    set({ links: updated });
    await putItem("links", newLink);
    return id;
  },

  updateLink: async (id, updates) => {
    const updatedLinks = get().links.map((lnk) => {
      if (lnk.id === id) {
        const updatedLnk = { ...lnk, ...updates };
        putItem("links", updatedLnk);
        return updatedLnk;
      }
      return lnk;
    });
    set({ links: updatedLinks });
  },

  deleteLink: async (id) => {
    const filtered = get().links.filter((lnk) => lnk.id !== id);
    set({ links: filtered });
    await deleteItem("links", id);
  },
}));
