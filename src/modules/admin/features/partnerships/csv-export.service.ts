import { Injectable } from '@nestjs/common';
import { createObjectCsvStringifier } from 'csv-writer';

@Injectable()
export class CsvExportService {
  formatFollowersHistoryCsv(data: any[]): string {
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'date', title: 'Date' },
        { id: 'followers', title: 'Followers Count' },
      ],
    });

    const records = data.map((item) => ({
      date: item.date,
      followers: item.followers_count,
    }));

    return (
      csvStringifier.getHeaderString() +
      csvStringifier.stringifyRecords(records)
    );
  }

  formatCsv(data: any[]): string {
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'id', title: 'ID' },
        { id: 'name', title: 'Name' },
        { id: 'screenName', title: 'Screen Name' },
        { id: 'score', title: 'Score' },
        { id: 'followersCount', title: 'Followers Count' },
        { id: 'friendsCount', title: 'Friends Count' },
        { id: 'verified', title: 'Verified' },
        { id: 'description', title: 'Description' },
      ],
    });

    const records = data.map((item) => ({
      id: item.id,
      name: item.name,
      screenName: item.screenName || item.userName,
      score: item.score,
      followersCount: item.followersCount,
      friendsCount: item.friendsCount,
      verified: item.verified,
      description: item.description,
    }));

    return (
      csvStringifier.getHeaderString() +
      csvStringifier.stringifyRecords(records)
    );
  }
}
