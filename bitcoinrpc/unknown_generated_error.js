/** Make an error for when it cannot be known that blocks were generated

  {
    count: <Expected Generated Blocks Count Number>
    err: <Generate Request Error Object>
    [height]: <Current Chain Height Number>
    start: <Chain Height Before Generating Number>
  }

  @returns
  [<Error Code Number>, <Error Message String>, <Error Details Object>]
*/
module.exports = ({count, err, height, start}) => {
  const [, cause, details] = err;
  const {code} = details || {};

  return [
    503,
    'UnknownIfBlocksWereGenerated',
    {cause, code, count, height, start},
  ];
};
