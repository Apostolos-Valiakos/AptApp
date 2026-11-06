-- A staff member's own order of their services, used by the booking service
-- picker. Existing assignments start in the shop's usual order.
ALTER TABLE staff_services ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE staff_services ss
SET sort_order = ordered.position
FROM (
  SELECT x.staff_id, x.service_id,
         ROW_NUMBER() OVER (
           PARTITION BY x.staff_id
           ORDER BY COALESCE(sc.sort_order, 999999), s.sort_order, s.name
         ) - 1 AS position
  FROM staff_services x
  JOIN services s ON s.id = x.service_id
  LEFT JOIN service_categories sc ON sc.shop_id = s.shop_id AND sc.name = s.category
) ordered
WHERE ss.staff_id = ordered.staff_id AND ss.service_id = ordered.service_id;
