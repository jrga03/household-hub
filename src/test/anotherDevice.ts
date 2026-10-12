import { CATEGORY_ENTITY, CATEGORY_RETIRED, CATEGORY_VERSIONS } from "@/lib/categories/events";
import { getCategory } from "@/lib/categories/projection";
import { formatHlc } from "@/lib/events/hlc";
import { receiveEvents } from "@/lib/events/log";
import { currentVersion } from "@/lib/events/versions";

/**
 * Another device retires the category without seeing the money this device
 * gave it: the only way a retired category still holds money.
 */
export async function retireOnAnotherDevice(
  actor: { householdId: string; userId: string },
  categoryId: string
): Promise<void> {
  const category = await getCategory(categoryId);
  if (!category) throw new Error("The category isn't on this device.");
  await receiveEvents(
    [
      {
        id: crypto.randomUUID(),
        householdId: actor.householdId,
        visibility: category.visibility,
        ownerUserId: category.ownerUserId,
        entityType: CATEGORY_ENTITY,
        entityId: categoryId,
        eventType: CATEGORY_RETIRED,
        eventVersion: currentVersion(CATEGORY_VERSIONS, CATEGORY_RETIRED),
        hlc: formatHlc({ wallTime: Date.now() + 1000, counter: 0, deviceId: "another-device" }),
        deviceId: "another-device",
        actorUserId: actor.userId,
        payload: {},
      },
    ],
    0
  );
}
