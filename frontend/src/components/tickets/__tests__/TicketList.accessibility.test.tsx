import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TicketList from "../TicketList";
import { useAuthStore } from "@/stores/auth-store";

vi.mock("@/hooks/use-tickets", () => ({
  useTickets: vi.fn(() => ({
    data: {
      data: [
        {
          id: "ticket-1",
          ticketNumber: "TKT-001",
          subject: "VPN issue",
          status: "Open",
          priority: "High",
          slaStatus: "OnTrack",
          createdAt: "2026-07-05T00:00:00.000Z",
          category: { id: "cat-1", name: "Network" },
          requester: { id: "user-1", name: "User", email: "user@example.com" },
          assignedTo: null,
          _count: { comments: 0, attachments: 0 },
        },
      ],
      meta: { page: 1, limit: 10, total: 1, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  })),
  useUpdateTicketPriority: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useAssignTicket: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteTicket: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("@/hooks/use-users", () => ({
  useAssignableUsers: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/hooks/use-categories", () => ({
  useCategories: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/hooks/use-locations", () => ({
  useLocations: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-all-users", () => ({
  useAllUsers: () => ({ data: [] }),
}));

describe("TicketList accessibility", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: "admin-1",
        email: "admin@example.com",
        name: "Admin",
        role: "Admin",
        isActive: true,
        avatarUrl: null,
        createdAt: "",
        updatedAt: "",
      },
      accessToken: "token",
      isAuthenticated: true,
    });
  });

  it("renders sortable headers as buttons and ticket navigation as a link", () => {
    render(
      <MemoryRouter>
        <TicketList
          filters={{
            status: [],
            priority: [],
            slaStatus: [],
            search: "",
            categoryId: [],
            locationId: [],
            requesterId: [],
            assignedToMe: false,
            datePreset: "all",
            startDate: "",
            endDate: "",
            limit: 10,
            sortBy: "createdAt",
            sortOrder: "desc",
          }}
          onFiltersChange={vi.fn()}
          page={1}
          onPageChange={vi.fn()}
          onLimitChange={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: /Ticket #/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /TKT-001/i })).toHaveAttribute(
      "href",
      "/tickets/ticket-1",
    );
  });
});
