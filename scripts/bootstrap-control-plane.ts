import { bootstrapOrganization } from '../lib/control-plane/bootstrap';
import { closeControlPlaneConnection } from '../lib/control-plane/client';
import { SupportedLocaleSchema } from '../lib/control-plane/types';

async function main() {
  const name = process.env.BOOTSTRAP_ORG_NAME?.trim();
  const slug = process.env.BOOTSTRAP_ORG_SLUG?.trim();
  const email = process.env.BOOTSTRAP_OWNER_EMAIL?.trim();
  const displayName = process.env.BOOTSTRAP_OWNER_NAME?.trim();

  if (!name || !slug || !email || !displayName) {
    throw new Error(
      'Set BOOTSTRAP_ORG_NAME, BOOTSTRAP_ORG_SLUG, BOOTSTRAP_OWNER_EMAIL and BOOTSTRAP_OWNER_NAME',
    );
  }

  const result = await bootstrapOrganization({
    organization: { name, slug },
    owner: {
      email,
      displayName,
      externalAuthId: process.env.BOOTSTRAP_OWNER_AUTH_ID?.trim() || undefined,
    },
    region: {
      locale: SupportedLocaleSchema.parse(process.env.BOOTSTRAP_LOCALE || 'pt-BR'),
      country: process.env.BOOTSTRAP_COUNTRY || 'BR',
      currency: process.env.BOOTSTRAP_CURRENCY || 'BRL',
      timezone: process.env.BOOTSTRAP_TIMEZONE || 'America/Sao_Paulo',
      firstDayOfWeek: 1,
    },
    optimalEngine:
      process.env.BOOTSTRAP_OE_TENANT_ID && process.env.BOOTSTRAP_OE_WORKSPACE_ID
        ? {
            tenantId: process.env.BOOTSTRAP_OE_TENANT_ID,
            organizationId: process.env.BOOTSTRAP_OE_ORGANIZATION_ID || undefined,
            workspaceId: process.env.BOOTSTRAP_OE_WORKSPACE_ID,
            workspaceName: process.env.BOOTSTRAP_OE_WORKSPACE_NAME || 'Principal',
            workspaceSlug: process.env.BOOTSTRAP_OE_WORKSPACE_SLUG || 'principal',
          }
        : undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeControlPlaneConnection);
