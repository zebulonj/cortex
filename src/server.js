import Rx from 'rx/dist/rx.all';
import Immutable from 'immutable';

import map from 'lodash/collection/map';
import defaults from 'lodash/object/defaults';

import { chainOperator, chain } from './chain';
Rx.Observable.prototype.chain = chainOperator;

const defaultState = {};

/**
 * Express.js routing for server-side Apostate.
 *
 * @param  {Router} router Express router.
 *
 * @return {Engine} Returns a server-side Apostate engine.
 */
export default function( router ) {
  const frames = new Rx.Subject();

  /**
   * Prepare an array of actions for mounting.
   */
  function prepare( actions ) {

    /**
     * @param {Object} req.state The initial state for the request.
     */
    return function( req, res, next ) {
      const { query, params } = req;
    	const { cacheState, fetchState } = (function( initializer ) {
    		let cachedState = Immutable.fromJS( defaults( initializer, defaultState ) );

    		return {
    			cacheState( state, source = "UNKNOWN" ) {
    				return ( cachedState = state );
    			},

    			fetchState() {
    				return cachedState;
    			}
    		};
    	})( Immutable.fromJS( req.state || {} ) );

    	/**
    	 * Wrap an action to inject current state and cache mutated state.
    	 *
    	 * @param action {Function} Accepts a function with signature `( params, mutableState ) => ( output )`.
    	 * @returns {Function} Returns a function with signature `( params ) => ( output )`.
    	 */
    	function wrap( action ) {
    		const name = ( action.displayName || action.name || 'action' );

    		let fn = function wrappedAction( inputs ) {
    			let output;

    			const state = fetchState().withMutations( function( mutableState ) {
    				output = action( mutableState, inputs );

    				return mutableState;
    			});

          cacheState( state, `ACTION (${ name })` );

    			if ( typeof output != 'object' || typeof output.subscribe != 'function' ) {
    				output = Rx.Observable.return( output );
    			}

    			return output;
    		};

    		fn.displayName = name + 'Wrapper';

    		return fn;
    	}

      Rx.Observable.return({ query, params })
        .chain( Rx.Observable.fromArray( map( actions, wrap ) ) )
        .subscribe(
          () => frames.onNext({ req, res, next, state: fetchState() }),
          ( err ) => next( err )
        );
    };
  }

  return {
    route( routes ) {
      // Mount routes.
      routes( function( path, actions ) {
        router.get( path, prepare( actions ) );
      });
    },

    render( handler ) {
      return frames.subscribe( ( params ) => handler( params ) );
    }
  };
}
