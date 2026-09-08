export type ScopeIds = "all" | readonly string[];

export interface AuthorizationContext {
  userId: string;
  companyId: string;
  capabilities: ReadonlySet<string>;
  brandIds: ScopeIds;
  accountIds: ScopeIds;
  variantIds: ScopeIds;
  canViewDraft: boolean;
  canViewPrices: boolean;
  scopeVersion: string;
  priceTierId: string | null;
  discountRate: string;
}

export interface ScopedTarget {
  companyId: string;
  brandId: string;
  variantId: string;
}

export interface UserManagementTarget {
  userId: string;
  companyId: string;
  changesRole: boolean;
}
