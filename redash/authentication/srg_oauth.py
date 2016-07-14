import logging
import requests
from flask import jsonify, redirect, url_for, Blueprint, flash, request, session
from flask_login import login_user
from flask_oauthlib.client import OAuth, OAuthException
from redash import models, settings
from redash.authentication.org_resolving import current_org

logger = logging.getLogger('srg_oauth')

oauth = OAuth()
blueprint = Blueprint('srg_oauth', __name__)

def srg_remote_app():
    if 'srg' not in oauth.remote_apps:
        oauth.remote_app('srg',
                         base_url=settings.SRG_OAUTH2_URL,
                         authorize_url=settings.SRG_OAUTH2_URL + 'authorize',
                         request_token_url=None,
                         request_token_params={'scope': ''},
                         access_token_url=settings.SRG_OAUTH2_URL + 'token',
                         access_token_method='POST',
                         consumer_key=settings.SRG_CLIENT_ID,
                         consumer_secret=settings.SRG_CLIENT_SECRET)

    return oauth.srg


# This will also add the new user to the admin group
def create_and_login_user(org, name, email):
    try:
        user_object = models.User.get_by_email_and_org(email, org)
        if user_object.name != name:
            logger.debug("Updating user name (%r -> %r)", user_object.name, name)
            user_object.name = name
            user_object.save()
    except models.User.DoesNotExist:
        logger.debug("Creating user object (%r)", name)
        user_object = models.User.create(org=org, name=name, email=email, groups=[org.default_group.id])

        # Add the user to the admin group
        admin_group = org.admin_group
        if admin_group.id in user_object.groups:
            pass # Do nothing
        else:
            user_object.groups.append(org.admin_group.id)
            user_object.save()

    login_user(user_object, remember=True)

    return user_object


@blueprint.route('/<org_slug>/oauth/srg', endpoint="authorize_org")
def org_login(org_slug):
    session['org_slug'] = current_org.slug
    return redirect(url_for(".authorize", next=request.args.get('next', None)))


@blueprint.route('/oauth/srg', endpoint="authorize")
def login():
    callback = url_for('.callback', _external=True)
    next = request.args.get('next', url_for("redash.index", org_slug=session.get('org_slug')))
    logger.debug("Callback url: %s", callback)
    logger.debug("Next is: %s", next)
    return srg_remote_app().authorize(callback=callback, state=next)


@blueprint.route('/oauth/srg_callback', endpoint="callback")
def authorized():
    resp = srg_remote_app().authorized_response()

    if type(resp) == OAuthException:
        logger.warning("Invalid response from the SSO %s", resp)
        return jsonify({'error': "Invalid SSO response. Please retry."})

    access_token = resp['access_token']
    
    if access_token is None:
        logger.warning("Access token missing in call back request.")
        return jsonify({'error': "Validation error. Please retry."})

    user = resp['user']

    if not user['is_staff']:
        logger.warning("Unauthorized user %s.", user['email'])
        return jsonify({'error': "User must be staff to use this system"})

    if 'org_slug' in session:
        org = models.Organization.get_by_slug(session.pop('org_slug'))
    else:
        org = current_org

    create_and_login_user(org, user['username'], user['email'])
    next = request.args.get('state') or url_for("redash.index", org_slug=org.slug)

    return redirect(next)
