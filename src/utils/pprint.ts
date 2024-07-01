import util from 'util'

/**
 * Pretty prints a fully expanded object to the console.
 * @param obj The object to print
 */
export default function pprint(obj: any){
    console.log(util.inspect(obj, false, null, true))
}