import restana from 'restana';
import * as jobStorage from '../../services/storage/jobStorage.js';
import * as userStorage from '../../services/storage/userStorage.js';
import { config } from '../../utils.js';
import { isAdmin } from '../security.js';
import logger from '../../services/logger.js';
import { bus } from '../../services/events/event-bus.js';

const service = restana();
const jobRouter = service.newRouter();

function doesJobBelongsToUser(job, req) {
  const userId = req.session.currentUser;
  if (userId == null) {
    return false;
  }
  const user = userStorage.getUser(userId);
  if (user == null) {
    return false;
  }
  return user.isAdmin || job.userId === user.id;
}

jobRouter.get('/', async (req, res) => {
  const isUserAdmin = isAdmin(req);
  //show only the jobs which belongs to the user (or all of the user is an admin)
  res.body = jobStorage
    .getJobs()
    .filter(
      (job) =>
        isUserAdmin || job.userId === req.session.currentUser || job.shared_with_user.includes(req.session.currentUser),
    )
    .map((job) => {
      return {
        ...job,
        isOnlyShared:
          !isUserAdmin &&
          job.userId !== req.session.currentUser &&
          job.shared_with_user.includes(req.session.currentUser),
      };
    });

  res.send();
});

jobRouter.get('/processingTimes', async (req, res) => {
  res.body = {
    interval: config.interval,
    lastRun: config.lastRun || null,
  };
  res.send();
});

jobRouter.post('/startAll', async (req, res) => {
  bus.emit('jobs:runAll');
  res.send();
});

jobRouter.post('/', async (req, res) => {
  const { provider, notificationAdapter, name, blacklist = [], jobId, enabled, shareWithUsers = [] } = req.body;
  try {
    let jobFromDb = jobStorage.getJob(jobId);

    if (jobFromDb && !doesJobBelongsToUser(jobFromDb, req)) {
      res.send(new Error('You are trying to change a job that is not associated to your user.'));
      return;
    }

    jobStorage.upsertJob({
      userId: req.session.currentUser,
      jobId,
      enabled,
      name,
      blacklist,
      provider,
      notificationAdapter,
      shareWithUsers,
    });
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});

jobRouter.delete('', async (req, res) => {
  const { jobId } = req.body;
  try {
    const job = jobStorage.getJob(jobId);
    if (!doesJobBelongsToUser(job, req)) {
      res.send(new Error('You are trying to remove a job that is not associated to your user'));
    } else {
      jobStorage.removeJob(jobId);
    }
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});
jobRouter.put('/:jobId/status', async (req, res) => {
  const { status } = req.body;
  const { jobId } = req.params;
  try {
    const job = jobStorage.getJob(jobId);
    if (!doesJobBelongsToUser(job, req)) {
      res.send(new Error('You are trying change a job that is not associated to your user'));
    } else {
      jobStorage.setJobStatus({
        jobId,
        status,
      });
    }
  } catch (error) {
    res.send(new Error(error));
    logger.error(error);
  }
  res.send();
});

jobRouter.get('/shareableUserList', async (req, res) => {
  const currentUser = req.session.currentUser;
  const users = userStorage.getUsers(false);
  res.body = users
    .filter((user) => !user.isAdmin && user.id !== currentUser)
    .map((user) => ({
      id: user.id,
      name: user.username,
    }));
  res.send();
});
export { jobRouter };
