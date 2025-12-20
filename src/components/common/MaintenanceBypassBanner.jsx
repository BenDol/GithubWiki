import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAdminStatus } from '../../hooks/useAdminStatus';

/**
 * Banner shown to admins when they're bypassing maintenance mode
 * Helps admins understand they're seeing the site while others can't
 */
const MaintenanceBypassBanner = () => {
  const { config } = useWikiConfig();
  const { isAdmin } = useAdminStatus();

  const maintenanceEnabled = config?.features?.maintenance?.enabled === true;
  const allowAdminBypass = config?.features?.maintenance?.allowAdminBypass !== false;
  const isBypassing = maintenanceEnabled && allowAdminBypass && isAdmin;

  if (!isBypassing) return null;

  return (
    <div className="bg-yellow-500 text-white px-4 py-2 text-center text-sm font-medium sticky top-0 z-50">
      🛡️ Admin Mode: Maintenance is active. You're viewing the site because you're an administrator.
    </div>
  );
};

export default MaintenanceBypassBanner;
