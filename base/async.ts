export interface SuccessResult<T> {
  status: 'success';
  result: T;
}

export interface ErrorResult {
  status: 'error';
  error: any;
}

export type PromiseResult<T> = SuccessResult<T> | ErrorResult;

/**
 * Given an array of promises, awaits on all of them and returns their results.
 * This method returns an array of result objects in the form of { result: res }
 * on success or { error: err } on error. Indexes in the result array are
 * guaranteed to match the indexes of the input array.
 */
export async function awaitPromises<T>(
  promises: Promise<T>[],
  returnResults: boolean = true
): Promise<PromiseResult<T>[]> {
  if (!promises.length) {
    return Promise.resolve([]);
  }

  const res = await Promise.all<any>(
    promises.map(async (p) => {
      try {
        const res = await p;
        if (returnResults) {
          return { status: 'success', result: res };
        }
      } catch (err) {
        if (returnResults) {
          return { status: 'error', error: err };
        }
      }
    })
  );

  if (returnResults) {
    return res.filter((x) => x !== undefined);
  }

  return res;
}
