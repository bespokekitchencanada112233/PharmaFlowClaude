const unavailable = async () => {
  throw new Error("User management requires the online web app.");
};

export const createStaffUser = unavailable;
export const setStaffDisplayName = unavailable;
export const deleteStaffUser = unavailable;
